"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { approveInvoice } from "@/app/actions/invoices";

/**
 * Approve multiple invoices at once. Skips any that are not in pending_review
 * or are low-confidence without manual review. Returns counts for UI feedback.
 */
export async function approveInvoicesBatch(
  invoiceIds: string[]
): Promise<{ error?: string; approved: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let approved = 0;
  let skipped = 0;
  for (const id of invoiceIds) {
    const r = await approveInvoice(id);
    if (r.success) approved++;
    else {
      skipped++;
      if (r.error) errors.push(`${id.slice(0, 8)}: ${r.error}`);
    }
  }
  revalidatePath("/invoices");
  return { approved, skipped, errors };
}

/** Set pending_draw on many invoices at once. */
export async function setPendingDrawBatch(
  invoiceIds: string[],
  pending: boolean
): Promise<{ error?: string; updated: number }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error, updated: 0 };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", updated: 0 };
  if (invoiceIds.length === 0) return { updated: 0 };
  const { error, data } = await supabase
    .from("invoices")
    .update({ pending_draw: pending })
    .in("id", invoiceIds)
    .select("id");
  if (error) return { error: error.message, updated: 0 };
  revalidatePath("/invoices");
  return { updated: data?.length ?? 0 };
}

/**
 * Pay an approved invoice via ACH auto-draft. Posts a single JE:
 *   DR AP (2000) / CR Cash (1000)
 * Invoice status goes to 'cleared'. Used for lender auto-drafts on loan
 * interest already booked DR WIP / CR AP at approval time.
 */
export async function payInvoiceAutoDraft(
  invoiceId: string,
  paymentDate?: string
): Promise<{ error?: string; success?: boolean }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, amount, total_amount, project_id, vendor, invoice_number")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status !== "approved") {
    return { error: "Invoice must be approved first" };
  }

  const today = paymentDate ?? new Date().toISOString().split("T")[0];
  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  const desc =
    [invoice.vendor, invoice.invoice_number].filter(Boolean).join(" - Inv #") ||
    "Invoice";

  const { error: upErr } = await supabase
    .from("invoices")
    .update({
      status: "cleared",
      payment_date: today,
      payment_method: "ach",
    })
    .eq("id", invoiceId);
  if (upErr) return { error: upErr.message };

  if (invoiceAmount > 0) {
    const { data: glAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_number")
      .in("account_number", ["2000", "1000"]);
    const acct2000 = glAccounts?.find((a) => a.account_number === "2000")?.id;
    const acct1000 = glAccounts?.find((a) => a.account_number === "1000")?.id;

    if (acct2000 && acct1000) {
      const { data: je } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: today,
          reference: `INV-AUTODR-${invoiceId.slice(0, 8)}`,
          description: `Auto-draft payment - ${desc}`,
          status: "posted",
          source_type: "invoice_payment",
          source_id: invoiceId,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (je) {
        await supabase.from("journal_entry_lines").insert([
          {
            journal_entry_id: je.id,
            account_id: acct2000,
            project_id: invoice.project_id ?? null,
            description: `AP - ${desc}`,
            debit: invoiceAmount,
            credit: 0,
          },
          {
            journal_entry_id: je.id,
            account_id: acct1000,
            project_id: invoice.project_id ?? null,
            description: `Auto-draft - ${desc}`,
            debit: 0,
            credit: invoiceAmount,
          },
        ]);
      }
    }
  }

  revalidatePath("/invoices");
  revalidatePath("/banking/payments");
  return { success: true };
}
