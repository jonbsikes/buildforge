import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supa = SupabaseClient<Database>;

export interface JournalEntryHeaderInput {
  entry_date: string;
  reference: string | null;
  description: string;
  status: "posted" | "draft" | "void";
  source_type: string;
  source_id?: string | null;
  loan_id?: string | null;
  user_id: string;
}

export interface JournalEntryLineInput {
  account_id: string;
  project_id?: string | null;
  cost_code_id?: string | null;
  loan_id?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
}

export interface PostJournalEntryResult {
  id?: string;
  error?: string;
}

/**
 * Post a balanced journal entry: insert header, insert lines, roll back header
 * if lines fail. Asserts sum(debit) === sum(credit) before any write.
 *
 * Use this in place of direct `.from("journal_entries").insert()` +
 * `.from("journal_entry_lines").insert()` pairs so the ledger can never be
 * left unbalanced.
 */
export async function postJournalEntry(
  supabase: Supa,
  header: JournalEntryHeaderInput,
  lines: JournalEntryLineInput[]
): Promise<PostJournalEntryResult> {
  if (!lines || lines.length === 0) {
    return { error: "Journal entry has no lines" };
  }

  const totalDebits = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return {
      error: `Journal entry does not balance: debits=${totalDebits.toFixed(2)} credits=${totalCredits.toFixed(2)}`,
    };
  }

  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      entry_date: header.entry_date,
      reference: header.reference ?? null,
      description: header.description,
      status: header.status,
      source_type: header.source_type,
      source_id: header.source_id ?? null,
      loan_id: header.loan_id ?? null,
      user_id: header.user_id,
    })
    .select("id")
    .single();

  if (entryError || !entry) {
    return { error: entryError?.message ?? "Failed to insert journal entry header" };
  }

  const rows = lines.map((l) => ({
    journal_entry_id: entry.id,
    account_id: l.account_id,
    project_id: l.project_id ?? null,
    cost_code_id: l.cost_code_id ?? null,
    loan_id: l.loan_id ?? null,
    description: l.description ?? null,
    debit: l.debit || 0,
    credit: l.credit || 0,
  }));

  const { data: inserted, error: linesError } = await supabase
    .from("journal_entry_lines")
    .insert(rows)
    .select("id");

  if (linesError || !inserted || inserted.length !== rows.length) {
    const { error: rollbackErr } = await supabase.from("journal_entries").delete().eq("id", entry.id);
    const linesMsg = linesError?.message ?? "Failed to insert all journal entry lines";
    const rollbackMsg = rollbackErr ? ` (rollback also failed: ${rollbackErr.message})` : " — entry rolled back";
    return { error: linesMsg + rollbackMsg };
  }

  return { id: entry.id };
}
