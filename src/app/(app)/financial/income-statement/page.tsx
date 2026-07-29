import Header from "@/components/layout/Header";
import IncomeStatementClient, {
  type IncomeStatementRpcRow,
} from "@/components/financial/IncomeStatementClient";
import { createClient } from "@/lib/supabase/server";

// Server-first report (Package 05 §B): default range is "this year" — same
// RPC as the client refetch and the exports.
export default async function IncomeStatementPage() {
  const supabase = await createClient();
  const now = new Date();
  const start = `${now.getFullYear()}-01-01`;
  const end = now.toISOString().split("T")[0]!;

  const { data: rpcData } = await (supabase.rpc as any)("get_income_statement_data", {
    p_start: start,
    p_end: end,
  });

  return (
    <>
      <Header title="Income Statement" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <IncomeStatementClient initialRows={(rpcData ?? []) as IncomeStatementRpcRow[]} />
      </main>
    </>
  );
}
