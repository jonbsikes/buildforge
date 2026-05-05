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
 * Post a balanced journal entry atomically via Postgres RPC.
 * The `post_journal_entry` function inserts the header and all lines in a
 * single transaction — if anything fails, the entire operation is rolled back
 * by Postgres (no manual DELETE needed).
 *
 * A client-side pre-check validates debits = credits (tolerance < 0.005)
 * before the network call for fast feedback.
 */
export async function postJournalEntry(
  supabase: Supa,
  header: JournalEntryHeaderInput,
  lines: JournalEntryLineInput[]
): Promise<PostJournalEntryResult> {
  if (!lines || lines.length === 0) {
    return { error: "Journal entry has no lines" };
  }

  // Client-side balance pre-check (tolerance 0.005)
  const totalDebits = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebits - totalCredits) >= 0.005) {
    return {
      error: `Journal entry does not balance: debits=${totalDebits.toFixed(2)} credits=${totalCredits.toFixed(2)}`,
    };
  }

  const { data, error } = await (supabase.rpc as any)("post_journal_entry", {
    p_entry_date: header.entry_date,
    p_reference: header.reference ?? null,
    p_description: header.description,
    p_status: header.status,
    p_source_type: header.source_type,
    p_source_id: header.source_id ?? null,
    p_loan_id: header.loan_id ?? null,
    p_user_id: header.user_id,
    p_lines: lines.map((l) => ({
      account_id: l.account_id,
      project_id: l.project_id ?? null,
      cost_code_id: l.cost_code_id ?? null,
      loan_id: l.loan_id ?? null,
      description: l.description ?? null,
      debit: l.debit || 0,
      credit: l.credit || 0,
    })),
  });

  if (error) {
    return { error: error.message };
  }

  return { id: data as string };
}
