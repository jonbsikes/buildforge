import Header from "@/components/layout/Header";
import BalanceSheetClient, {
  type BalanceSheetRpcRow,
} from "@/components/financial/BalanceSheetClient";
import { createClient } from "@/lib/supabase/server";

// Server-first report (Package 05 §B): the default as-of (today) is fetched
// here via the same RPC the exports use; the client re-fetches only when the
// user changes the date.
export default async function BalanceSheetPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0]!;

  const [{ data: openCredits }, { data: rpcData }] = await Promise.all([
    supabase
      .from("vendor_credits")
      .select("amount, applied_amount")
      .eq("status", "available")
      .lte("credit_date", today),
    (supabase.rpc as any)("get_balance_sheet_data", { p_as_of_date: today }),
  ]);
  const creditsAvailable = (openCredits ?? []).reduce(
    (s: number, c: { amount: number; applied_amount: number | null }) =>
      s + Math.max(0, Number(c.amount) - Number(c.applied_amount ?? 0)),
    0,
  );

  return (
    <>
      <Header title="Balance Sheet" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <BalanceSheetClient
          initialRows={(rpcData ?? []) as BalanceSheetRpcRow[]}
          initialCredits={creditsAvailable}
          initialAsOf={today}
        />
      </main>
    </>
  );
}
