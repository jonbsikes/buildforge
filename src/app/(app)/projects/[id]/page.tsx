import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import TabNav from "@/components/projects/TabNav";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, MapPin, Calendar, Plus, Pencil,
  TrendingUp, CheckCircle2, Clock, BarChart3, Layers, Landmark, FileSignature, BookOpen,
} from "lucide-react";
import type { Database } from "@/types/database";
import { Suspense } from "react";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Sale = Database["public"]["Tables"]["sales"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

const statusStyles: Record<string, string> = {
  planning: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  on_hold: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-600",
};
const projectTypeLabels: Record<string, string> = {
  home_construction: "Home Construction",
  land_development: "Land Development",
};
const saleTypeLabels: Record<string, string> = {
  lot_sale: "Lot Sale", house_sale: "House Sale",
  progress_payment: "Progress Payment", deposit: "Deposit",
  variation: "Variation", other: "Other",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const supabase = await createClient();

  const [projectRes, budgetRes, invoicesRes, loansRes, stagesRes, salesRes, milestonesRes] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("project_budget").select("budgeted_amount, actual_amount, cost_code").eq("project_id", id),
    supabase.from("invoices").select("amount, total_amount, status").eq("project_id", id),
    supabase.from("loans").select("id, total_amount, status").eq("project_id", id),
    supabase.from("project_stages").select("id, status").eq("project_id", id),
    supabase.from("sales").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("milestones").select("*").eq("project_id", id).order("due_date", { ascending: true }),
  ]);

  if (!projectRes.data) notFound();

  const project = projectRes.data as Project;
  const budgetRows = budgetRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const loans = loansRes.data ?? [];
  const projectStages = stagesRes.data ?? [];
  const sales = (salesRes.data ?? []) as Sale[];
  const milestones = (milestonesRes.data ?? []) as Milestone[];

  const totalBudgeted = budgetRows.reduce((s, b) => s + (b.budgeted_amount ?? 0), 0);
  const paidInvoices = invoices.filter((i) => ["approved", "scheduled", "paid"].includes(i.status ?? ""));
  const totalActual = paidInvoices.reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0);
  const contractPrice = project.contract_price ?? 0;
  const profit = contractPrice > 0 ? contractPrice - totalActual : null;

  const activeLoans = loans.filter((l) => l.status === "active");
  const totalLoanCommitment = activeLoans.reduce((s, l) => s + (l.total_amount ?? 0), 0);

  const completedStages = projectStages.filter((s) => s.status === "complete").length;
  const totalTrackedStages = projectStages.length;

  const totalRevenue = sales.filter((s) => s.is_settled).reduce((sum, s) => sum + (s.settled_amount ?? s.contract_price ?? 0), 0);
  const totalContracted = sales.reduce((sum, s) => sum + (s.contract_price ?? 0), 0);

  return (
    <>
      <Header title={project.name} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          {/* Back + edit */}
          <div className="flex items-center justify-between mb-4">
            <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft size={15} /> Projects
            </Link>
            <Link href={`/projects/${id}/edit`} className="inline-flex items-center gap-2 border border-gray-300 px-3 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              <Pencil size={14} /> Edit
            </Link>
          </div>

          {/* Project header card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    {projectTypeLabels[project.project_type] ?? project.project_type}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyles[project.status]}`}>
                    {project.status.replace("_", " ")}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-1">{project.name}</h1>
                {project.address && (
                  <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                    <MapPin size={13} /> {project.address}
                  </div>
                )}
                {project.description && <p className="text-gray-500 text-sm mt-1">{project.description}</p>}
              </div>
              {contractPrice > 0 && (
                <div className="text-right">
                  <p className="text-xs text-gray-400 mb-0.5">Contract Price</p>
                  <p className="text-2xl font-bold text-gray-900">{fmt(contractPrice)}</p>
                </div>
              )}
            </div>
            {(project.start_date || project.end_date) && (
              <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                <span className="flex items-center gap-1.5"><Calendar size={13} />Start: {fmtDate(project.start_date)}</span>
                <span className="flex items-center gap-1.5"><Calendar size={13} />Target Close: {fmtDate(project.target_close ?? project.end_date)}</span>
              </div>
            )}
          </div>

          {/* Summary stat row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Budgeted", value: fmt(totalBudgeted), color: "text-gray-900" },
              { label: "Actual Spend", value: fmt(totalActual), color: totalActual > totalBudgeted && totalBudgeted > 0 ? "text-red-600" : "text-gray-900" },
              { label: "Loan Commitment", value: totalLoanCommitment > 0 ? fmt(totalLoanCommitment) : "—", color: "text-gray-900" },
              { label: "Est. Profit", value: profit != null ? fmt(profit) : "—", color: profit == null ? "text-gray-400" : profit >= 0 ? "text-emerald-600" : "text-red-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <Suspense>
            <TabNav projectId={id} />
          </Suspense>

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <div className="space-y-5">
              {/* Quick links to main sub-pages */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link href={`/projects/${id}/stages`}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm hover:border-amber-300 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                      <Layers size={18} className="text-amber-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Build Stages</h3>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{completedStages} <span className="text-sm font-normal text-gray-400">/ {totalTrackedStages} tracked</span></p>
                  <p className="text-xs text-gray-400 mt-1">stages completed · View all 54 →</p>
                </Link>

                <Link href={`/projects/${id}/budget`}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm hover:border-amber-300 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <BarChart3 size={18} className="text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Budget</h3>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{fmt(totalBudgeted)}</p>
                  <p className="text-xs text-gray-400 mt-1">{fmt(totalActual)} spent · View breakdown →</p>
                </Link>

                <Link href={`/projects/${id}/loans`}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm hover:border-amber-300 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
                      <Landmark size={18} className="text-violet-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Loans</h3>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{activeLoans.length}</p>
                  <p className="text-xs text-gray-400 mt-1">active · {fmt(totalLoanCommitment)} committed →</p>
                </Link>

                <Link href={`/projects/${id}/field-logs`}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm hover:border-amber-300 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center">
                      <BookOpen size={18} className="text-sky-600" />
                    </div>
                    <h3 className="font-semibold text-gray-900">Field Logs</h3>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Daily observations & to-dos →</p>
                </Link>
              </div>

              {/* Upcoming milestones preview */}
              {milestones.filter((m) => !m.is_completed).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900">Upcoming Milestones</h2>
                    <Link href={`/projects/${id}?tab=schedule`} className="text-sm text-amber-600 hover:underline">View all</Link>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {milestones.filter((m) => !m.is_completed).slice(0, 4).map((m) => {
                      const due = m.due_date ? new Date(m.due_date) : null;
                      const overdue = due && due < new Date() && !m.is_completed;
                      return (
                        <div key={m.id} className="px-5 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock size={14} className={overdue ? "text-red-400" : "text-gray-400"} />
                            <span className="text-sm text-gray-800">{m.name}</span>
                          </div>
                          <span className={`text-xs ${overdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
                            {fmtDate(m.due_date)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BUILD STAGES TAB ── redirect to stages page */}
          {tab === "stages" && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center">
              <Layers size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-3">View the full build stage tracker.</p>
              <Link href={`/projects/${id}/stages`} className="inline-flex items-center gap-1.5 bg-amber-500 text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400">
                Open Stage Tracker →
              </Link>
            </div>
          )}

          {/* ── BUDGET TAB ── redirect to budget page */}
          {tab === "budget" && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center">
              <BarChart3 size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-3">View and manage budget by cost code.</p>
              <Link href={`/projects/${id}/budget`} className="inline-flex items-center gap-1.5 bg-amber-500 text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400">
                Open Budget →
              </Link>
            </div>
          )}

          {/* ── LOANS TAB ── redirect to loans page */}
          {tab === "loans" && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center">
              <Landmark size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-3">View loans, draw requests, and payments.</p>
              <Link href={`/projects/${id}/loans`} className="inline-flex items-center gap-1.5 bg-amber-500 text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400">
                Open Loans →
              </Link>
            </div>
          )}

          {/* ── CONTRACTS TAB ── redirect to contracts page */}
          {tab === "contracts" && (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center">
              <FileSignature size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-3">View and manage contracts and change orders.</p>
              <Link href={`/projects/${id}/contracts`} className="inline-flex items-center gap-1.5 bg-amber-500 text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400">
                Open Contracts →
              </Link>
            </div>
          )}

          {/* ── SALES TAB ── */}
          {tab === "sales" && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Contracted", value: fmt(totalContracted), color: "text-gray-900" },
                  { label: "Settled / Received", value: fmt(totalRevenue), color: "text-emerald-600" },
                  { label: "Outstanding", value: fmt(totalContracted - totalRevenue), color: "text-amber-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Sales & Revenue</h2>
                  <Link href={`/projects/${id}/sales/new`} className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400 font-medium">
                    <Plus size={14} /> Add Sale
                  </Link>
                </div>
                {sales.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <TrendingUp size={36} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No sales recorded yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Description</th>
                          <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Type</th>
                          <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Buyer</th>
                          <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Contract</th>
                          <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Settled</th>
                          <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {sales.map((sale) => (
                          <tr key={sale.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3">
                              <div className="font-medium text-gray-900">{sale.description}</div>
                              {sale.settlement_date && <div className="text-xs text-gray-400">Settlement: {fmtDate(sale.settlement_date)}</div>}
                            </td>
                            <td className="px-5 py-3 text-gray-500 text-xs">{saleTypeLabels[sale.sale_type] ?? sale.sale_type}</td>
                            <td className="px-5 py-3 text-gray-600 text-sm">{sale.buyer_name ?? "—"}</td>
                            <td className="px-5 py-3 text-right text-gray-700">{sale.contract_price ? fmt(sale.contract_price) : "—"}</td>
                            <td className="px-5 py-3 text-right text-emerald-600 font-medium">
                              {sale.is_settled && sale.settled_amount ? fmt(sale.settled_amount) : "—"}
                            </td>
                            <td className="px-5 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sale.is_settled ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                {sale.is_settled ? "Settled" : "Pending"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SCHEDULE TAB ── */}
          {tab === "schedule" && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Milestones</h2>
                <Link href={`/projects/${id}/milestones/new`} className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400 font-medium">
                  <Plus size={14} /> Add Milestone
                </Link>
              </div>
              {milestones.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Calendar size={36} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No milestones yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {milestones.map((m) => {
                    const due = m.due_date ? new Date(m.due_date) : null;
                    const overdue = due && due < new Date() && !m.is_completed;
                    return (
                      <div key={m.id} className="px-5 py-4 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${m.is_completed ? "bg-green-500 border-green-500" : overdue ? "border-red-400" : "border-gray-300"}`}>
                            {m.is_completed && <CheckCircle2 size={12} className="text-white" />}
                          </div>
                          <div>
                            <p className={`font-medium text-sm ${m.is_completed ? "line-through text-gray-400" : "text-gray-900"}`}>{m.name}</p>
                            {m.notes && <p className="text-xs text-gray-500 mt-0.5">{m.notes}</p>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {m.is_completed ? (
                            <p className="text-xs text-green-600 font-medium">Done {fmtDate(m.completed_date)}</p>
                          ) : (
                            <p className={`text-xs font-medium ${overdue ? "text-red-600" : "text-gray-500"}`}>
                              {overdue ? "Overdue · " : "Due "}{fmtDate(m.due_date)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
