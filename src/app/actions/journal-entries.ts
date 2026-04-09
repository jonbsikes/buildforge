"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

export async function voidJournalEntry(id: string) {
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