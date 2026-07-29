import Header from "@/components/layout/Header";
import WIPClient, { type WIPRow } from "@/components/financial/WIPClient";
import { createClient } from "@/lib/supabase/server";

function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.min(100, Math.max(0, (num / den) * 100));
}

// Server-first report (Package 05 §B): all aggregates load here via the same
// RPCs the exports use; the client only handles the status filter.
export default async function WIPReportPage() {
  const supabase = await createClient();

  const [projectsRes, budgetsRes, contractsRes, actualsRes, loansRes, wipBalancesRes] = await Promise.all([
    supabase.from("projects").select("id, name, project_type, status").order("name"),
    (supabase.rpc as any)("get_project_budget_totals"),
    supabase.from("contracts").select("project_id, amount"),
    (supabase.rpc as any)("get_invoice_line_actuals_by_project"),
    supabase.from("loans").select("project_id, loan_amount"),
    (supabase.rpc as any)("get_wip_balances"),
  ]);

  const projects = projectsRes.data ?? [];

  // Server-side aggregates, keyed by project_id
  const budgetMap: Record<string, number> = {};
  for (const b of (budgetsRes.data ?? []) as { project_id: string; total_budget: number }[]) {
    budgetMap[b.project_id] = Number(b.total_budget);
  }

  const committedMap: Record<string, number> = {};
  for (const c of contractsRes.data ?? []) {
    committedMap[c.project_id] = (committedMap[c.project_id] ?? 0) + (c.amount ?? 0);
  }

  const actualMap: Record<string, number> = {};
  for (const li of (actualsRes.data ?? []) as { project_id: string; total_amount: number }[]) {
    actualMap[li.project_id] = Number(li.total_amount);
  }

  const loanMap: Record<string, number> = {};
  for (const l of loansRes.data ?? []) {
    loanMap[l.project_id] = (loanMap[l.project_id] ?? 0) + (l.loan_amount ?? 0);
  }

  // Ledger WIP balances (1210, 1220, 1230) by project via server-side aggregation
  const ledgerWipMap: Record<string, number> = {};
  const capIntMap: Record<string, number> = {};
  for (const row of (wipBalancesRes.data ?? []) as { project_id: string; account_number: string; total_debit: number; total_credit: number }[]) {
    const pid = row.project_id;
    const net = Number(row.total_debit) - Number(row.total_credit);
    if (row.account_number === "1210" || row.account_number === "1230") {
      ledgerWipMap[pid] = (ledgerWipMap[pid] ?? 0) + net;
    }
    if (row.account_number === "1220") {
      capIntMap[pid] = (capIntMap[pid] ?? 0) + net;
    }
  }

  const wipRows: WIPRow[] = projects.map((p) => {
    const budget = budgetMap[p.id] ?? 0;
    const committed = committedMap[p.id] ?? 0;
    const actual = actualMap[p.id] ?? 0;
    const loanAmount = loanMap[p.id] ?? 0;

    return {
      id: p.id,
      name: p.name,
      type: p.project_type,
      status: p.status,
      budget,
      committed,
      actual,
      pctComplete: pct(actual, budget),
      remaining: budget - actual,
      loanAmount,
      // Over/under = committed + actual vs budget
      underOver: budget - (committed + actual),
      ledgerWip: (ledgerWipMap[p.id] ?? 0) + (capIntMap[p.id] ?? 0),
      capitalizedInterest: capIntMap[p.id] ?? 0,
    };
  });

  return (
    <>
      <Header title="WIP Report" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <WIPClient rows={wipRows} />
      </main>
    </>
  );
}
