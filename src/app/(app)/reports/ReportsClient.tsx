"use client";

import { useState, useMemo } from "react";
import type { Database } from "@/types/database";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type CostItem = Database["public"]["Tables"]["cost_items"]["Row"];
type Stage = Database["public"]["Tables"]["stages"]["Row"];
type Sale = Database["public"]["Tables"]["sales"]["Row"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

function pct(a: number, b: number) {
  if (b === 0) return "—";
  return `${((a / b) * 100).toFixed(1)}%`;
}

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  on_hold: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-600",
};

export default function ReportsClient({
  projects,
  costItems,
  stages,
  sales,
}: {
  projects: Project[];
  costItems: CostItem[];
  stages: Stage[];
  sales: Sale[];
}) {
  const [selectedProject, setSelectedProject] = useState<string>("all");

  const filtered = useMemo(() => ({
    projects: selectedProject === "all" ? projects : projects.filter((p) => p.id === selectedProject),
    costItems: selectedProject === "all" ? costItems : costItems.filter((c) => c.project_id === selectedProject),
    stages: selectedProject === "all" ? stages : stages.filter((s) => s.project_id === selectedProject),
    sales: selectedProject === "all" ? sales : sales.filter((s) => s.project_id === selectedProject),
  }), [selectedProject, projects, costItems, stages, sales]);

  // Totals
  const totalBudget = filtered.projects.reduce((s, p) => s + p.total_budget, 0);
  const totalBudgeted = filtered.costItems.reduce((s, c) => s + c.budgeted_amount, 0);
  const totalActual = filtered.costItems.reduce((s, c) => s + c.actual_amount, 0);
  const totalRevenue = filtered.sales.filter((s) => s.is_settled).reduce((sum, s) => sum + (s.settled_amount ?? 0), 0);
  const grossProfit = totalRevenue - totalActual;

  // Category breakdown
  const byCategory = useMemo(() => {
    const map: Record<string, { budgeted: number; actual: number }> = {};
    for (const item of filtered.costItems) {
      if (!map[item.category]) map[item.category] = { budgeted: 0, actual: 0 };
      map[item.category].budgeted += item.budgeted_amount;
      map[item.category].actual += item.actual_amount;
    }
    return Object.entries(map)
      .map(([cat, vals]) => ({ cat, ...vals }))
      .sort((a, b) => b.actual - a.actual);
  }, [filtered.costItems]);

  // Per-project summary
  const perProject = useMemo(() => {
    return filtered.projects.map((p) => {
      const items = filtered.costItems.filter((c) => c.project_id === p.id);
      const budgeted = items.reduce((s, c) => s + c.budgeted_amount, 0);
      const actual = items.reduce((s, c) => s + c.actual_amount, 0);
      const projectSales = filtered.sales.filter((s) => s.project_id === p.id && s.is_settled);
      const revenue = projectSales.reduce((s, sale) => s + (sale.settled_amount ?? 0), 0);
      return { project: p, budgeted, actual, revenue, profit: revenue - actual };
    });
  }, [filtered]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Project filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Project</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Project Budget</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalBudget)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Actual Spend</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalActual)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{pct(totalActual, totalBudget)} of budget</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Settled Revenue</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Gross Profit</p>
          <p className={`text-xl font-bold ${grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
            {fmt(grossProfit)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{pct(grossProfit, totalRevenue)} margin</p>
        </div>
      </div>

      {/* Per-project table */}
      {perProject.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Project Summary</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Budget</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Budgeted</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actual</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Variance</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {perProject.map(({ project, budgeted, actual, revenue, profit }) => {
                  const variance = budgeted - actual;
                  return (
                    <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <a href={`/projects/${project.id}`} className="font-medium hover:underline">
                          {project.name}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {project.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(project.total_budget)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(budgeted)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(actual)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {variance >= 0 ? "+" : ""}{fmt(variance)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(revenue)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmt(profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      )}

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Spend by Category</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Budgeted</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actual</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Variance</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byCategory.map(({ cat, budgeted, actual }) => {
                  const variance = budgeted - actual;
                  return (
                    <tr key={cat} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900 capitalize">{cat.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(budgeted)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(actual)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {variance >= 0 ? "+" : ""}{fmt(variance)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{pct(actual, totalActual)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-xs text-gray-500 uppercase">Total</td>
                  <td className="px-4 py-3 text-right text-gray-900">{fmt(totalBudgeted)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{fmt(totalActual)}</td>
                  <td className={`px-4 py-3 text-right ${(totalBudgeted - totalActual) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {(totalBudgeted - totalActual) >= 0 ? "+" : ""}{fmt(totalBudgeted - totalActual)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">100%</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        </section>
      )}

      {filtered.projects.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-sm text-gray-400">
          No data to report. Create a project and add cost items.
        </div>
      )}
    </div>
  );
}
