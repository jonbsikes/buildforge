import Header from "@/components/layout/Header";
import CashFlowClient from "@/components/financial/CashFlowClient";
import { createClient } from "@/lib/supabase/server";

// Server-first report (Package 05 §B): default range is since-inception —
// same RPC as the client refetch and the exports.
export default async function CashFlowPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0]!;

  const { data: bucketData } = await (supabase.rpc as any)("get_cash_flow_statement", {
    p_start: "2000-01-01",
    p_end: today,
  });
  const initialBucket = ((bucketData ?? []) as Record<string, number | string>[])[0];

  return (
    <>
      <Header title="Cash Flow Statement" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <CashFlowClient initialBucket={initialBucket} />
      </main>
    </>
  );
}
