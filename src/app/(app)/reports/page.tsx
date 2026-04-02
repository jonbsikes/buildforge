import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Invoice = Pick<Database["public"]["Tables"]["invoices"]["Row"], "project_id" | "cost_code" | "amount" | "total_amount" | "status" | "payment_date">;
type Budget = Database["public"]["Tables"]["project_budget"]["Row"];
type CostCode = Pick<Database["public"]["Tables"]["cost_codes"]["Row"], "code" | "description" | "category">;
type Loan = Pick<Database["public"]["Tables"]["loans"]["Row"], "id" | "project_id" | "total_amount" | "interest_rate" | "status">;
type Draw = Pick<Database["public"]["Tables"]["loan_draws"]["Row"], "loan_id" | "amount_approved" | "status">;
type Vendor = Pick<Database["public"]["Tables"]["vendors"]["Row"], "id" | "name">;

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function pct(a: number, b: number) {
  if (b === 0) return "—";
  return `${((a / b) * 100).toFixed(1)}%`;
}

export default async function ReportsPage() {
  const supabase = await createClient();

  const [projectsRes, invoicesRes, budgetRes, costCodesRes, loansRes, drawsRes] = await Promise.all([
    supabase.from("projects").select("*").order("name"),
    supabase.from("invoices").select("project_id, cost_code, amount, total_amount, status, payment_date"),
    supabase.from("project_budget").select("*"),
    supabase.from("cost_codes").select("code, description, category").order("code"),
    supabase.from("loans").select("id, project_id, total_amount, interest_rate, status"),
    supabase.from("loan_draws").select("loan_id, amount_approved, status"),
  ]);

  const projects = (projectsRes.data ?? []) as Project[];
  const invoices = (invoicesRes.data ?? []) as Invoice[];
  const budgetRows = (budgetRes.data ?? []) as Budget[];
  const costCodes = (costCodesRes.data ?? []) as CostCode[];
  const loans = (loansRes.data ?? []) as Loan[];
  const draws = (drawsRes.data ?? []) as Draw[];

  const codeMap = Object.fromEntries(costCodes.map((c) => [c.code, c]));

  // Approved/paid invoices for actuals
  const paidInvoices = invoices.filter((i) => ["approved", "scheduled", "paid"].includes(i.status ?? ""));

  // Per-project rollup
  const projectRows = projects.map((p) => {
    const projInv = paidInvoices.filter((i) => i.project_id === p.id);
    const actual = projInv.reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0);
    const budgeted = budgetRows.filter((b) => b.project_id === p.id).reduce((s, b) => s + b.budgeted_amount, 0);
    const contractPrice = p.contract_price ?? 0;
    const profit = contractPrice > 0 ? contractPrice - actual : null;
    return { project: p, actual, budgeted, contractPrice, profit };
  });

  // Cost code breakdown across all projects
  const byCode: Record<number, { code: CostCode; budgeted: number; actual: number }> = {};
  for (const b of budgetRows) {
    const code = codeMap[b.cost_code];
    if (!code) continue;
    if (!byCode[b.cost_code]) byCode[b.cost_code] = { code, budgeted: 0, actual: 0 };
    byCode[b.cost_code].budgeted += b.budgeted_amount;
    byCode[b.cost_code].actual += b.actual_amount;
  }
  // Overlay invoice actuals
  for (const inv of paidInvoices) {
    if (!inv.cost_code) continue;
    const code = codeMap[inv.cost_code];
    if (!code) continue;
    if (!byCode[inv.cost_code]) byCode[inv.cost_code] = { code, budgeted: 0, actual: 0 };
    byCode[inv.cost_code].actual = Math.max(byCode[inv.cost_code].actual, inv.amount ?? inv.total_amount ?? 0);
  }
  const codeRows = Object.values(byCode).sort((a, b) => b.actual - a.actual);

  // AP aging
  const unpaid = invoices.filter((i) => !["paid"].includes(i.status ?? ""));
  const apTotal = unpaid.reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0);
  const pendingCount = invoices.filter((i) => i.status === "pending_review").length;

  // Loan summary
  const activeLoans = loans.filter((l) => l.status === "active");
  const totalCommitment = activeLoans.reduce((s, l) => s + l.total_amount, 0);
  const fundedDraws = draws.filter((d) => d.status === "funded");
  const drawnByLoan: Record<string, number> = {};
  for (const d of fundedDraws) {
    drawnByLoan[d.loan_id] = (drawnByLoan[d.loan_id] ?? 0) + (d.amount_approved ?? 0);
  }
  const totalDrawn = activeLoans.reduce((s, l) => s + (drawnByLoan[l.id] ?? 0), 0);

  const totalActual = projectRows.reduce((s, r) => s + r.actual, 0);
  const totalBudgeted = projectRows.reduce((s, r) => s + r.budgeted, 0);
  const totalContractValue = projectRows.reduce((s, r) => s + r.contractPrice, 0);

  return (
    <>
      <Header title="Reports" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Top summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Budgeted", value: fmt(totalBudgeted) },
              { label: "Total Actual Spend", value: fmt(totalActual), highlight: totalActual > totalBudgeted },
              { label: "Total Contract Value", value: fmt(totalContractValue) },
              { label: "AP Outstanding", value: fmt(apTotal), highlight: apTotal > 0 },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`text-xl font-bold ${highlight ? "text-amber-600" : "text-gray-900"}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "Invoices Pending Review", value: pendingCount, href: "/invoices?status=pending_review", urgent: pendingCount > 0 },
              { label: "Active Loans", value: activeLoans.length, href: "/loans" },
              { label: "Loan Capacity Remaining", value: fmt(totalCommitment - totalDrawn), href: "/loans" },
            ].map(({ label, value, href, urgent }) => (
              <Link key={label} href={href}
                className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow ${urgent ? "border-amber-300" : "border-gray-200"}`}>
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`text-xl font-bold ${urgent ? "text-amber-600" : "text-gray-900"}`}>{value}</p>
              </Link>
            ))}
          </div>

          {/* Project P&L */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Project P&L Summary</h2>
            </div>
            {projects.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400">No projects yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Project</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Budgeted</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Actual</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Contract Price</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Est. Profit</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {projectRows.map(({ project, actual, budgeted, contractPrice, profit }) => (
                      <tr key={project.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900">
                          <Link href={`/projects/${project.id}`} className="hover:text-amber-600">{project.name}</Link>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500 capitalize">{project.status.replace("_", " ")}</td>
                        <td className="px-5 py-3 text-right text-gray-700">{fmt(budgeted)}</td>
                        <td className={`px-5 py-3 text-right font-medium ${actual > budgeted && budgeted > 0 ? "text-red-600" : "text-gray-700"}`}>{fmt(actual)}</td>
                        <td className="px-5 py-3 text-right text-gray-700">{contractPrice > 0 ? fmt(contractPrice) : "—"}</td>
                        <td className={`px-5 py-3 text-right font-bold ${profit == null ? "text-gray-400" : profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {profit != null ? fmt(profit) : "—"}
                        </td>
                        <td className={`px-5 py-3 text-right text-xs font-medium ${profit != null && profit >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {profit != null && contractPrice > 0 ? pct(profit, contractPrice) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Spend by cost code */}
          {codeRows.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Spend by Cost Code</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase w-16">Code</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Description</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Category</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Budgeted</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Actual</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {codeRows.map(({ code, budgeted, actual }) => {
                      const variance = budgeted - actual;
                      return (
                        <tr key={code.code} className="hover:bg-gray-50">
                          <td className="px-5 py-2">
                            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{code.code}</span>
                          </td>
                          <td className="px-5 py-2 text-gray-700">{code.description}</td>
                          <td className="px-5 py-2 text-xs text-gray-400">{code.category}</td>
                          <td className="px-5 py-2 text-right text-gray-600">{fmt(budgeted)}</td>
                          <td className={`px-5 py-2 text-right font-medium ${actual > budgeted && budgeted > 0 ? "text-red-600" : "text-gray-700"}`}>{fmt(actual)}</td>
                          <td className={`px-5 py-2 text-right text-xs font-medium ${variance >= 0 ? "text-green-600" : "text-red-500"}`}>
                            {variance >= 0 ? "+" : ""}{fmt(variance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
