"use client";

import { useState, useMemo } from "react";

type Project = { id: string; name: string; status: string };

type CostCodeJoin = {
  id: string;
  code: string;
  name: string;
  category: string;
};

type ProjectCostCode = {
  id: string;
  project_id: string;
  budgeted_amount: number;
  cost_codes: CostCodeJoin | null;
};

type InvoiceLineItem = {
  project_id: string | null;
  cost_code: string | null;
  amount: number | null;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pct(a: number, b: number) {
  if (b === 0) return "—";
  return `${((a / b) * 100).toFixed(1)}%`;
}

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-600",
  pre_construction: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  on_hold: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-600",
};

export default function ReportsClient({
  projects,
  projectCostCodes,
  lineItems,
}: {
  projects: Project[];
  projectCostCodes: ProjectCostCode[];
  lineItems: InvoiceLineItem[];
}) {
  const [selectedProject, setSelectedProject] = useState<string>("all");

  const filtered = useMemo(() => ({
    projects: selectedProject === "all" ? projects : projects.filter((p) => p.id === selectedProject),
    pccs: selectedProject === "all" ? projectCostCodes : projectCostCodes.filter((c) => c.project_id === selectedProject),
    lineItems: selectedProject === "all" ? lineItems : lineItems.filter((li) => li.project_id === selectedProject),
  }), [selectedProject, projects, projectCostCodes, lineItems]);

  // actual spend keyed by `${project_id}:${cost_code_number}`
  const actualByProjectCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const li of filtered.lineItems) {
      if (!li.project_id || !li.cost_code) continue;
      const key = `${li.project_id}:${li.cost_code}`;
      map.set(key, (map.get(key) ?? 0) + (li.amount ?? 0));
    }
    return map;
  }, [filtered.lineItems]);

  // Per-row budget+actual+category for downstream rollups
  const rows = useMemo(() => {
    return filtered.pccs
      .map((pcc) => {
        const cc = pcc.cost_codes;
        if (!cc) return null;
        const budgeted = pcc.budgeted_amount ?? 0;
        const actual = actualByProjectCode.get(`${pcc.project_id}:${cc.code}`) ?? 0;
        return {
          projectId: pcc.project_id,
          category: cc.category,
          budgeted,
          actual,
        };
      })
      .filter((r): r is { projectId: string; category: string; budgeted: number; actual: number } => r !== null);
  }, [filtered.pccs, actualByProjectCode]);

  // Totals
  const totalBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  // Category breakdown
  const byCategory = useMemo(() => {
    const map: Record<string, { budgeted: number; actual: number }> = {};
    for (const r of rows) {
      if (!map[r.category]) map[r.category] = { budgeted: 0, actual: 0 };
      map[r.category].budgeted += r.budgeted;
      map[r.category].actual += r.actual;
    }
    return Object.entries(map)
      .map(([cat, vals]) => ({ cat, ...vals }))
      .sort((a, b) => b.actual - a.actual);
  }, [rows]);

  // Per-project summary
  const perProject = useMemo(() => {
    return filtered.projects.map((p) => {
      const projectRows = rows.filter((r) => r.projectId === p.id);
      const budgeted = projectRows.reduce((s, r) => s + r.budgeted, 0);
      const actual = projectRows.reduce((s, r) => s + r.actual, 0);
      return { project: p, budgeted, actual };
    });
  }, [filtered.projects, rows]);

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total Budgeted</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalBudgeted)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Actual Spend</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalActual)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{pct(totalActual, totalBudgeted)} of budget</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Variance</p>
          <p className={`text-xl font-bold ${(totalBudgeted - totalActual) >= 0 ? "text-green-600" : "text-red-600"}`}>
            {(totalBudgeted - totalActual) >= 0 ? "+" : ""}{fmt(totalBudgeted - totalActual)}
          </p>
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
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Budgeted</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actual</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Variance</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">% Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {perProject.map(({ project, budgeted, actual }) => {
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
                          {project.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(budgeted)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(actual)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {variance >= 0 ? "+" : ""}{fmt(variance)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{pct(actual, budgeted)}</td>
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
          No data to report. Create a project and add cost codes.
        </div>
      )}
    </div>
  );
}
