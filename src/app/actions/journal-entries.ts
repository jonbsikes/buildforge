"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

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

  const totalDebits = input.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredits = input.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error("Journal entry does not balance: debits must equal credits");
  }

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: input.entry_date,
      reference: input.reference || null,
      description: input.description,
      status: input.status,
      source_type: input.source_type || "manual",
      loan_id: input.loan_id || null,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (entryError) throw new Error(entryError.message);

  const lines = input.lines.map((l) => ({
    journal_entry_id: entry.id,
    account_id: l.account_id,
    project_id: l.project_id || null,
    cost_code_id: l.cost_code_id || null,
    loan_id: l.loan_id || null,
    description: l.description || null,
    debit: l.debit,
    credit: l.credit,
  }));

  const { data: insertedLines, error: linesError } = await supabase
    .from("journal_entry_lines")
    .insert(lines)
    .select("id");

  if (linesError || !insertedLines || insertedLines.length !== lines.length) {
    // Rollback: delete the header to prevent an unbalanced entry
    await supabase.from("journal_entries").delete().eq("id", entry.id);
    throw new Error(linesError?.message ?? "Failed to insert all journal entry lines — entry rolled back");
  }

  revalidatePath("/financial/journal-entries");
  return { id: entry.id };
}

export async function reverseJournalEntry(id: string, reverseDate?: string) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error ?? "Permission denied");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Load the original entry header
  const { data: original, error: origError } = await supabase
    .from("journal_entries")
    .select("id, entry_date, reference, description, status, source_type, loan_id")
    .eq("id", id)
    .single();

  if (origError || !original) throw new Error("Journal entry not found");
  if (original.status !== "posted") throw new Error("Only posted entries can be reversed");

  // Load the original lines
  const { data: origLines, error: linesError } = await supabase
    .from("journal_entry_lines")
    .select("account_id, project_id, cost_code_id, loan_id, description, debit, credit")
    .eq("journal_entry_id", id);

  if (linesError || !origLines || origLines.length === 0) {
    throw new Error("Could not load journal entry lines");
  }

  const entryDate = reverseDate ?? new Date().toISOString().split("T")[0];
  const origRef = original.reference ?? id.slice(0, 8);
  const newReference = `REV-${origRef}`;
  const newDescription = `Reversal of: ${original.description}`;

  // Insert the reversing entry header
  const { data: revEntry, error: revEntryError } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: entryDate,
      reference: newReference,
      description: newDescription,
      status: "posted",
      source_type: "manual",
      loan_id: original.loan_id ?? null,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (revEntryError || !revEntry) throw new Error(revEntryError?.message ?? "Failed to create reversing entry");

  // Insert reversed lines (swap debit ↔ credit)
  const reversedLines = origLines.map((l) => ({
    journal_entry_id: revEntry.id,
    account_id: l.account_id,
    project_id: l.project_id ?? null,
    cost_code_id: l.cost_code_id ?? null,
    loan_id: l.loan_id ?? null,
    description: l.description ?? null,
    debit: l.credit,   // swapped
    credit: l.debit,   // swapped
  }));

  const { data: insertedLines, error: insertError } = await supabase
    .from("journal_entry_lines")
    .insert(reversedLines)
    .select("id");

  if (insertError || !insertedLines || insertedLines.length !== reversedLines.length) {
    await supabase.from("journal_entries").delete().eq("id", revEntry.id);
    throw new Error(insertError?.message ?? "Failed to insert reversing lines — entry rolled back");
  }

  revalidatePath("/financial/journal-entries");
  return { id: revEntry.id };
}

export async function voidJournalEntry(id: string) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error ?? "Permission denied");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("journal_entries")
    .update({ status: "voided" })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/financial/journal-entries");
  return { success: true };
}