import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createClient();

  const [
    { data: projects },
    { data: projectCostCodes },
    { data: lineItems },
  ] = await Promise.all([
    supabase.from("projects").select("id, name, status").order("name"),
    supabase
      .from("project_cost_codes")
      .select("id, project_id, budgeted_amount, cost_codes ( id, code, name, category )"),
    supabase
      .from("invoice_line_items")
      .select("project_id, cost_code, amount, invoices!inner ( status )")
      .in("invoices.status", ["approved", "scheduled", "released", "cleared"]),
  ]);

  return (
    <>
      <Header title="Reports" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <ReportsClient
          projects={projects ?? []}
          projectCostCodes={(projectCostCodes ?? []) as never}
          lineItems={(lineItems ?? []) as never}
        />
      </main>
    </>
  );
}
