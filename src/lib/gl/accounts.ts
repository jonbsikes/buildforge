import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Supa = SupabaseClient<Database>;

export type AccountIdMap = {
  get(accountNumber: string): string | undefined;
  has(accountNumber: string): boolean;
};

/**
 * Look up chart_of_accounts.id by account_number for a set of numbers.
 * Returns a Map-compatible wrapper. Missing account numbers simply return
 * undefined from .get() — callers decide whether missing is an error.
 */
export async function getAccountIdMap(
  supabase: Supa,
  accountNumbers: Iterable<string>
): Promise<AccountIdMap> {
  const unique = [...new Set([...accountNumbers].filter(Boolean))];
  if (unique.length === 0) {
    return new Map<string, string>();
  }

  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number")
    .in("account_number", unique);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row?.account_number && row?.id) map.set(row.account_number, row.id);
  }
  return map;
}
