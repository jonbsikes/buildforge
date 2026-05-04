"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { getAccountIdMap } from "@/lib/gl/accounts";
import { postJournalEntry } from "@/lib/gl/postEntry";
import {
  revalidateAfterJournalEntry,
  revalidateAfterInvoiceMutation,
} from "@/lib/cache";
import { revalidatePath } from "next/cache";

export interface CreateVendorCreditInput {
  vendor_id: string;
  project_id: string | null;
  cost_code: string | null;
  credit_date: string;
  credit_number: string | null;
  original_invoice_id: string | null;
  amount: number;
  reason: string | null;
  notes: string | null;
}

// Vendor credits are debit balances in AP. Posting on entry:
//   DR Accounts Payable (2000)         <- reduce vendor's owed AP
//   CR WIP / CIP / G&A                 <- mirror invoice JE, reversed
// Account selection is by project type (same rule as invoice approval).
function wipCreditAccountFor(projectId: string | null, projectType: string | null): string {
  if (!projectId) return "6900"; // G&A
  if (projectType === "land_development") return "1230";
  return "1210";
}

export async function createVendorCredit(
  input: CreateVendorCreditInput
): Promise<{ error?: string; creditId?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!input.vendor_id) return { error: "Vendor is required" };
  if (!input.amount || input.amount <= 0) return { error: "Credit amount must be greater than zero" };
  if (!input.credit_date) return { error: "Credit date is required" };

  // Look up project type for account selection
  let projectType: string | null = null;
  if (input.project_id) {
    const { data: proj } = await supabase
      .from("projects")
      .select("project_type")
      .eq("id", input.project_id)
      .single();
    projectType = (proj as { project_type: string } | null)?.project_type ?? null;
  }

  const wipAccount = wipCreditAccountFor(input.project_id, projectType);

  const { data: vendorRow } = await supabase
    .from("vendors")
    .select("name")
    .eq("id", input.vendor_id)
    .single();
  const vendorName = (vendorRow as { name: string } | null)?.name ?? "Vendor";

  // Insert the credit row first (in available status, no JE yet) so we can
  // attach the JE id after posting.
  const { data: credit, error: insertErr } = await supabase
    .from("vendor_credits")
    .insert({
      vendor_id: input.vendor_id,
      project_id: input.project_id,
      cost_code: input.cost_code,
      credit_date: input.credit_date,
      credit_number: input.credit_number,
      original_invoice_id: input.original_invoice_id,
      amount: input.amount,
      reason: input.reason,
      notes: input.notes,
      status: "available",
      user_id: user.id,
    })
    .select("id")
    .single();

  if (insertErr || !credit) {
    return { error: insertErr?.message ?? "Failed to create vendor credit" };
  }

  // Post the JE
  const acctMap = await getAccountIdMap(supabase, ["2000", wipAccount]);
  const acct2000 = acctMap.get("2000");
  const wipAcctId = acctMap.get(wipAccount);

  if (!acct2000 || !wipAcctId) {
    await supabase.from("vendor_credits").delete().eq("id", credit.id);
    return { error: `Required GL accounts not found (2000 or ${wipAccount})` };
  }

  const label = `${vendorName}${input.credit_number ? " — Credit #" + input.credit_number : ""}`;

  const jeResult = await postJournalEntry(
    supabase,
    {
      entry_date: input.credit_date,
      reference: `CREDIT-${credit.id.slice(0, 8)}`,
      description: `Vendor credit — ${label}`,
      status: "posted",
      source_type: "vendor_credit",
      source_id: credit.id,
      user_id: user.id,
    },
    [
      {
        account_id: acct2000,
        project_id: null,
        description: `AP credit — ${label}`,
        debit: input.amount,
        credit: 0,
      },
      {
        account_id: wipAcctId,
        project_id: input.project_id,
        description: `Cost reversal — ${label}`,
        debit: 0,
        credit: input.amount,
      },
    ]
  );

  if (jeResult.error) {
    await supabase.from("vendor_credits").delete().eq("id", credit.id);
    return { error: jeResult.error };
  }

  await supabase
    .from("vendor_credits")
    .update({ journal_entry_id: jeResult.id })
    .eq("id", credit.id);

  revalidateAfterJournalEntry({ projectId: input.project_id ?? undefined });
  revalidatePath("/invoices/credits");
  revalidatePath("/invoices");
  return { creditId: credit.id };
}

export async function voidVendorCredit(
  creditId: string
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: credit } = await supabase
    .from("vendor_credits")
    .select("id, status, applied_amount, journal_entry_id")
    .eq("id", creditId)
    .single();

  if (!credit) return { error: "Credit not found" };
  if (credit.status === "void") return { error: "Credit is already void" };
  if ((credit.applied_amount ?? 0) > 0) {
    return { error: "Cannot void a credit that has been applied to invoices. Remove the applications first." };
  }

  // Void the original JE (don't delete — preserves audit trail)
  if (credit.journal_entry_id) {
    await supabase
      .from("journal_entries")
      .update({ status: "voided" })
      .eq("id", credit.journal_entry_id);
  }

  const { error } = await supabase
    .from("vendor_credits")
    .update({ status: "void" })
    .eq("id", creditId);

  if (error) return { error: error.message };

  revalidateAfterJournalEntry();
  revalidatePath("/invoices/credits");
  revalidatePath("/invoices");
  return {};
}

export async function deleteVendorCredit(
  creditId: string
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: credit } = await supabase
    .from("vendor_credits")
    .select("id, status, applied_amount, journal_entry_id")
    .eq("id", creditId)
    .single();

  if (!credit) return { error: "Credit not found" };
  if ((credit.applied_amount ?? 0) > 0) {
    return { error: "Cannot delete a credit that has applications. Void it instead." };
  }

  if (credit.journal_entry_id) {
    // Delete JE lines + header (acceptable since this credit was never applied)
    await supabase
      .from("journal_entry_lines")
      .delete()
      .eq("journal_entry_id", credit.journal_entry_id);
    await supabase
      .from("journal_entries")
      .delete()
      .eq("id", credit.journal_entry_id);
  }

  const { error } = await supabase
    .from("vendor_credits")
    .delete()
    .eq("id", creditId);

  if (error) return { error: error.message };

  revalidateAfterJournalEntry();
  revalidatePath("/invoices/credits");
  revalidatePath("/invoices");
  return {};
}

/**
 * Returns available credits for a vendor with remaining_amount > 0.
 * Sorted oldest first (FIFO) so the UI can pre-select for auto-apply.
 */
export async function getAvailableCreditsForVendor(
  vendorId: string
): Promise<{
  credits: Array<{
    id: string;
    credit_date: string;
    credit_number: string | null;
    amount: number;
    applied_amount: number;
    remaining: number;
    reason: string | null;
    project_id: string | null;
  }>;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vendor_credits")
    .select("id, credit_date, credit_number, amount, applied_amount, reason, project_id, status")
    .eq("vendor_id", vendorId)
    .eq("status", "available")
    .order("credit_date", { ascending: true });

  const credits = (data ?? [])
    .map((r) => ({
      id: r.id as string,
      credit_date: r.credit_date as string,
      credit_number: (r.credit_number as string | null) ?? null,
      amount: Number(r.amount),
      applied_amount: Number(r.applied_amount ?? 0),
      remaining: Number(r.amount) - Number(r.applied_amount ?? 0),
      reason: (r.reason as string | null) ?? null,
      project_id: (r.project_id as string | null) ?? null,
    }))
    .filter((c) => c.remaining > 0.005);

  return { credits };
}
