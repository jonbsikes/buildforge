"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { postJournalEntry } from "@/lib/gl/postEntry";

export interface JournalLineInput {
  account_id: string;
  project_id: string | null;
  cost_code_id?: string | null;
  loan_id?: string | null;
  description: string;
  debit: number;
  credit: number;
}

export interface JournalEntryInput {
  entry_date: string;
  reference: string;
  description: string;
  status: "draft" | "posted";
  loan_id?: string | null;
  source_type?: string;
  lines: JournalLineInput[];
}

export async function createJournalEntry(input: JournalEntryInput) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error ?? "Permission denied");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const result = await postJournalEntry(
    supabase,
    {
      entry_date: input.entry_date,
      reference: input.reference || null,
      description: input.description,
      status: input.status,
      source_type: input.source_type || "manual",
      loan_id: input.loan_id ?? null,
      user_id: user.id,
    },
    input.lines.map((l) => ({
      account_id: l.account_id,
      project_id: l.project_id,
      cost_code_id: l.cost_code_id ?? null,
      loan_id: l.loan_id ?? null,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    }))
  );

  if (result.error || !result.id) throw new Error(result.error ?? "Failed to post journal entry");

  revalidatePath("/financial/journal-entries");
  return { id: result.id };
}

export async function reverseJournalEntry(id: string, reverseDate?: string) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error ?? "Permission denied");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check for existing reversal to prevent double-reversal
  const { data: existingReversal } = await supabase
    .from("journal_entries")
    .select("id")
    .like("reference", "REV-%")
    .eq("source_id", id)
    .eq("status", "posted")
    .limit(1);

  if (existingReversal && existingReversal.length > 0) {
    throw new Error("This entry has already been reversed.");
  }

  const { data: original, error: origError } = await supabase
    .from("journal_entries")
    .select("id, entry_date, reference, description, status, source_type, loan_id")
    .eq("id", id)
    .single();

  if (origError || !original) throw new Error("Journal entry not found");
  if (original.status !== "posted") throw new Error("Only posted entries can be reversed");

  const { data: origLines, error: linesError } = await supabase
    .from("journal_entry_lines")
    .select("account_id, project_id, cost_code_id, loan_id, description, debit, credit")
    .eq("journal_entry_id", id);

  if (linesError || !origLines || origLines.length === 0) {
    throw new Error("Could not load journal entry lines");
  }

  const entryDate = reverseDate ?? new Date().toISOString().split("T")[0];
  const origRef = original.reference ?? id.slice(0, 8);

  const result = await postJournalEntry(
    supabase,
    {
      entry_date: entryDate,
      reference: `REV-${origRef}`,
      description: `Reversal of: ${original.description}`,
      status: "posted",
      source_type: "manual",
      loan_id: original.loan_id ?? null,
      user_id: user.id,
    },
    origLines.map((l) => ({
      account_id: l.account_id,
      project_id: l.project_id ?? null,
      cost_code_id: l.cost_code_id ?? null,
      loan_id: l.loan_id ?? null,
      description: l.description ?? null,
      debit: l.credit, // swapped
      credit: l.debit, // swapped
    }))
  );

  if (result.error || !result.id) throw new Error(result.error ?? "Failed to post reversing entry");

  // Void the original entry now that the reversal is posted
  await supabase
    .from("journal_entries")
    .update({ status: "void" })
    .eq("id", id);

  revalidatePath("/financial/journal-entries");
  return { id: result.id };
}

export async function voidJournalEntry(id: string) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error ?? "Permission denied");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fetch the entry to check source_type before voiding
  const { data: entry } = await supabase
    .from("journal_entries")
    .select("source_type, source_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("journal_entries")
    .update({ status: "void" })
    .eq("id", id);

  if (error) throw new Error(error.message);

  // If this was an invoice approval JE, reset wip_ap_posted on the source invoice
  if (entry?.source_type === "invoice_approval" && entry.source_id) {
    await supabase
      .from("invoices")
      .update({ wip_ap_posted: false })
      .eq("id", entry.source_id);
  }

  revalidatePath("/financial/journal-entries");
  return { success: true };
}
