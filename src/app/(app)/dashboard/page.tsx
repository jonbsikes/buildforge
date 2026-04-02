import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import {
  FolderOpen,
  DollarSign,
  TrendingUp,
  FileText,
  Plus,
} from "lucide-react";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const statusColors: Record<string, string> = {
  planning: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  on_hold: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-600",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [projectsRes, budgetRes, invoicesRes, loansRes, drawsRes] = await Promise.all([
    supabase.from("projects").select("id, name, status, contract_price"),
    supabase.from("project_budget").select("project_id, budgeted_amount, actual_amount"),
    supabase.from("invoices").select("project_id, amount, total_amount, status"),
    supabase.from("loans").select("id, project_id, total_amount, status"),
    supabase.from("loan_draws").select("loan_id, amount_approved, status"),
  ]);

  const projects = (projectsRes.data ?? []) as Pick<ProjectRow, "id" | "name" | "status" | "contract_price">[];
  const budgetRows = budgetRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const loans = loansRes.data ?? [];
  const draws = drawsRes.data ?? [];

  const activeProjects = projects.filter((p) => p.status === "active").length;

  const totalBudgeted = budgetRows.reduce((s, b) => s + (b.budgeted_amount ?? 0), 0);

  const paidInvoices = invoices.filter((i) => ["approved", "scheduled", "paid"].includes(i.status ?? ""));
  const totalActual = paidInvoices.reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0);

  const pendingReviewCount = invoices.filter((i) => i.status === "pending_review").length;

  const activeLoans = loans.filter((l) => l.status === "active");
  const totalLoanCommitment = activeLoans.reduce((s, l) => s + (l.total_amount ?? 0), 0);
  const fundedDraws = draws.filter((d) => d.status === "funded");
  const drawnByLoan: Record<string, number> = {};
  for (const d of fundedDraws) {
    drawnByLoan[d.loan_id] = (drawnByLoan[d.loan_id] ?? 0) + (d.amount_approved ?? 0);
  }
  const totalDrawn = activeLoans.reduce((s, l) => s + (drawnByLoan[l.id] ?? 0), 0);
  const loanAvailable = totalLoanCommitment - totalDrawn;

  const projectRows = projects.map((p) => {
    const projBudget = budgetRows.filter((b) => b.project_id === p.id);
    const budgeted = projBudget.reduce((s, b) => s + (b.budgeted_amount ?? 0), 0);
    const projInv = paidInvoices.filter((i) => i.project_id === p.id);
    const actual = projInv.reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0);
    const contractPrice = p.contract_price ?? 0;
    const profit = contractPrice > 0 ? contractPrice - actual : null;
    return { project: p, budgeted, actual, contractPrice, profit };
  });

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-4 sm:p-6 overflow-auto bg-gray-50">
        {/* Hero stat row */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {/* Active Projects */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <FolderOpen size={20} className="text-amber-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{activeProjects}</p>
            <p className="text-sm font-medium text-gray-500 mt-1">Active Projects</p>
            <p className="text-xs text-gray-400 mt-0.5">{projects.length} total</p>
          </div>

          {/* Total Budgeted */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <DollarSign size={20} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{fmt(totalBudgeted)}</p>
            <p className="text-sm font-medium text-gray-500 mt-1">Total Budgeted</p>
            <p className="text-xs text-gray-400 mt-0.5">{fmt(totalActual)} spent</p>
          </div>

          {/* Loan Capacity */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <TrendingUp size={20} className="text-violet-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{fmt(loanAvailable)}</p>
            <p className="text-sm font-medium text-gray-500 mt-1">Loan Capacity</p>
            <p className="text-xs text-gray-400 mt-0.5">{fmt(totalDrawn)} drawn of {fmt(totalLoanCommitment)}</p>
          </div>

          {/* AP Queue */}
          <Link
            href="/invoices?status=pending_review"
            className={`bg-white rounded-2xl border shadow-sm p-5 hover:shadow-md transition-shadow ${
              pendingReviewCount > 0 ? "border-amber-300" : "border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                pendingReviewCount > 0 ? "bg-amber-50" : "bg-gray-50"
              }`}>
                <FileText size={20} className={pendingReviewCount > 0 ? "text-amber-600" : "text-gray-400"} />
              </div>
              {pendingReviewCount > 0 && (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold">
                  {pendingReviewCount}
                </span>
              )}
            </div>
            <p className={`text-3xl font-bold ${pendingReviewCount > 0 ? "text-amber-600" : "text-gray-900"}`}>
              {pendingReviewCount}
            </p>
            <p className="text-sm font-medium text-gray-500 mt-1">AP Queue</p>
            <p className="text-xs text-gray-400 mt-0.5">invoices pending review</p>
          </Link>
        </div>

        {/* Projects table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Projects</h2>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
            >
              <Plus size={15} />
              New Project
            </Link>
          </div>

          {projects.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <FolderOpen size={28} className="text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-700 mb-1">No projects yet</h3>
              <p className="text-gray-500 text-sm mb-4">Create your first project to start tracking costs and stages.</p>
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
              >
                <Plus size={15} />
                Create Project
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Project</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Budgeted</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Actual Spend</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Contract Price</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Est. Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {projectRows.map(({ project, budgeted, actual, contractPrice, profit }) => (
                    <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-gray-900 hover:text-amber-600 transition-colors"
                        >
                          {project.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[project.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {project.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">{fmt(budgeted)}</td>
                      <td className={`px-6 py-4 text-right font-medium ${actual > budgeted && budgeted > 0 ? "text-red-600" : "text-gray-700"}`}>
                        {fmt(actual)}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-600">
                        {contractPrice > 0 ? fmt(contractPrice) : "—"}
                      </td>
                      <td className={`px-6 py-4 text-right font-bold ${
                        profit == null ? "text-gray-400" : profit >= 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {profit != null ? fmt(profit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
