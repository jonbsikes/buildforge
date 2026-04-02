"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown, AlertTriangle } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

interface VarianceRow {
  projectId: string;
  projectName: string;
  codeId: string;
  code: string;
  name: string;
  budget: number;
  actual: number;
  variance: number;
  pct: number; // actual / budget * 100
}

interface Project { id: string; name: string }

export default function BudgetVarianceReportClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rows, setRows] = useState<VarianceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState("all");
  const [filterType, setFilterType] = useState<"all" | "over" | "under">("all");

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("project_cost_codes").select("id, budgeted_amount, project_id, cost_codes ( id, code, name )"),
      supabase.from("invoices").select("cost_code_id, project_id, amount, total_amount").in("status", ["approved", "paid"]),
    ]).then(([projRes, pccRes, invRes]) => {
      setProjects(projRes.data ?? []);

      const projectNames: Record<string, string> = {};
      for (const p of projRes.data ?? []) projectNames[p.id] = p.name;

      const actualMap: Record<string, number> = {}; // key: `${project_id}:${cost_code_id}`
      for (const inv of invRes.data ?? []) {
        if (!inv.cost_code_id || !inv.project_id) continue;
        const key = `${inv.project_id}:${inv.cost_code_id}`;
        const amt = inv.total_amount ?? inv.amount ?? 0;
        actualMap[key] = (actualMap[key] ?? 0) + amt;
      }

      const built: VarianceRow[] = (pccRes.data ?? [])
        .map((pcc) => {
          const cc = pcc.cost_codes as { id: string; code: string; name: string } | null;
          if (!cc || !pcc.project_id) return null;
          const budget = pcc.budgeted_amount ?? 0;
          const actual = actualMap[`${pcc.project_id}:${cc.id}`] ?? 0;
          if (budget === 0 && actual === 0) return null;
          const variance = budget - actual;
          return {
            projectId: pcc.project_id,
            projectName: projectNames[pcc.project_id] ?? "—",
            codeId: cc.id,
            code: cc.code,
            name: cc.name,
            budget,
            actual,
            variance,
            pct: budget > 0 ? (actual / budget) * 100 : 0,
          };
        })
        .filter((r): r is VarianceRow => r !== null)
        .sort((a, b) => a.variance - b.variance); // most over-budget first

      setRows(built);
      setLoading(false);
    });
  }, []);

  const filtered = rows.filter((r) => {
    if (filterProject !== "all" && r.projectId !== filterProject) return false;
    if (filterType === "over" && r.variance >= 0) return false;
    if (filterType === "under" && r.variance < 0) return false;
    return true;
  });

  const overCount  = filtered.filter((r) => r.variance < 0).length;
  const totalOver  = filtered.filter((r) => r.variance < 0).reduce((s, r) => s + Math.abs(r.variance), 0);
  const totalUnder = filtered.filter((r) => r.variance >= 0).reduce((s, r) => s + r.variance, 0);

  function exportCSV() {
    const lines = [
      ["Project", "Code", "Name", "Budget", "Actual", "Variance", "% Used"].join(","),
      ...filtered.map((r) =>
        [`"${r.projectName}"`, r.code, `"${r.name}"`,
          r.budget.toFixed(2), r.actual.toFixed(2), r.variance.toFixed(2),
          r.budget > 0 ? r.pct.toFixed(1) + "%" : "N/A",
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "budget-variance.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white min-w-48"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(["all", "over", "under"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 ${filterType === t ? "bg-[#4272EF] text-white" : "bg-white text-gray-600 hover:bg-gray-50"} transition-colors`}
            >
              {t === "all" ? "All" : t === "over" ? "Over Budget" : "Under Budget"}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <FileDown size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400 mb-1">Over-Budget Line Items</p>
          <p className="text-2xl font-semibold text-red-600">{overCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400 mb-1">Total Overage</p>
          <p className="text-2xl font-semibold text-red-600">{fmt(totalOver)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400 mb-1">Total Savings</p>
          <p className="text-2xl font-semibold text-green-600">{fmt(totalUnder)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No data matching filters.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Project", "Code", "Description", "Budget", "Actual", "Variance", "% Used"].map((h) => (
                  <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide ${["Project","Code","Description"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r, i) => {
                const over = r.variance < 0;
                const usedPct = Math.min(r.pct, 200);
                return (
                  <tr key={i} className={`hover:bg-gray-50 transition-colors ${over ? "bg-red-50/30" : ""}`}>
                    <td className="px-4 py-2.5 text-gray-700 max-w-[180px] truncate">{r.projectName}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{r.code}</td>
                    <td className="px-4 py-2.5 text-gray-800">{r.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{r.budget > 0 ? fmt(r.budget) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">{r.actual > 0 ? fmt(r.actual) : <span className="text-gray-300">—</span>}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${over ? "text-red-600" : "text-green-600"}`}>
                      <span className="flex items-center justify-end gap-1">
                        {over && <AlertTriangle size={12} />}
                        {fmt(r.variance)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.budget > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${r.pct > 100 ? "bg-red-500" : r.pct > 80 ? "bg-amber-400" : "bg-green-500"}`}
                              style={{ width: `${Math.min(usedPct / 2, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-10 text-right">{r.pct.toFixed(0)}%</span>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
