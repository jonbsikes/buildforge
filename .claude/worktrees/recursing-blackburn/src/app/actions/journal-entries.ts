// @ts-nocheck
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface JournalLineInput {
  account_id: string;
  project_id: string | null;
  description: string;
  debit: number;
  credit: number;
}

export interface JournalEntryInput {
  entry_date: string;
  reference: string;
  description: string;
  status: "draft" | "posted";
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
      source_type: "manual",
      user_id: user.id,
    })
    .select("id")
    .single();

  if (entryError) throw new Error(entryError.message);

  const lines = input.lines.map((l) => ({
    journal_entry_id: entry.id,
    account_id: l.account_id,
    project_id: l.project_id || null,
    description: l.description || null,
    debit: l.debit,
    credit: l.credit,
  }));

  const { error: linesError } = await supabase.from("journal_entry_lines").insert(lines);
  if (linesError) throw new Error(linesError.message);

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
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/financial/journal-