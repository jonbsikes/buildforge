"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

interface Project { id: string; name: string }
interface CostCodeRow {
  code: string;
  name: string;
  category: string;
  budget: number;
  committed: number;
  actual: number;
}

export default function JobCostReportClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [rows, setRows] = useState<CostCodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    createClient()
      .from("projects")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        const list = data ?? [];
        setProjects(list);
        if (list.length > 0) setSelectedProject(list[0]!.id);
        setInitialLoad(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    const supabase = createClient();

    Promise.all([
      supabase
        .from("project_cost_codes")
        .select("id, budgeted_amount, cost_codes ( id, code, name, category )")
        .eq("project_id", selectedProject),
      supabase
        .from("contracts")
        .select("cost_code_id, amount")
        .eq("project_id", selectedProject),
      supabase
        .from("invoices")
        .select("cost_code_id, amount, total_amount")
        .eq("project_id", selectedProject)
        .in("status", ["approved", "paid"]),
    ]).then(([pccRes, contractRes, invRes]) => {
      const committedMap: Record<string, number> = {};
      for (const c of contractRes.data ?? []) {
        if (c.cost_code_id)
          committedMap[c.cost_code_id] = (committedMap[c.cost_code_id] ?? 0) + (c.amount ?? 0);
      }
      const actualMap: Record<string, number> = {};
      for (const inv of invRes.data ?? []) {
        if (inv.cost_code_id) {
          const amt = inv.total_amount ?? inv.amount ?? 0;
          actualMap[inv.cost_code_id] = (actualMap[inv.cost_code_id] ?? 0) + amt;
        }
      }

      const built: CostCodeRow[] = (pccRes.data ?? [])
        .map((pcc) => {
          const cc = pcc.cost_codes as { id: string; code: string; name: string; category: string } | null;
          if (!cc) return null;
          return {
            code: cc.code,
            name: cc.name,
            category: cc.category,
            budget: pcc.budgeted_amount ?? 0,
            committed: committedMap[cc.id] ?? 0,
            actual: actualMap[cc.id] ?? 0,
          };
        })
        .filter((r): r is CostCodeRow => r !== null)
        .sort((a, b) => parseInt(a.code) - parseInt(b.code));

      setRows(built);
      setLoading(false);
    });
  }, [selectedProject]);

  const totBudget    = rows.reduce((s, r) => s + r.budget, 0);
  const totCommitted = rows.reduce((s, r) => s + r.committed, 0);
  const totActual    = rows.reduce((s, r) => s + r.actual, 0);
  const totVariance  = totBudget - totActual;

  function exportCSV() {
    const projectName = projects.find((p) => p.id === selectedProject)?.name ?? "project";
    const lines = [
      ["Code", "Name", "Category", "Budget", "Committed", "Actual", "Variance", "% Used"].join(","),
      ...rows.map((r) =>
        [r.code, `"${r.name}"`, `"${r.category}"`,
          r.budget.toFixed(2), r.committed.toFixed(2), r.actual.toFixed(2),
          (r.budget - r.actual).toFixed(2),
          r.budget > 0 ? ((r.actual / r.budget) * 100).toFixed(1) + "%" : "0%",
        ].join(",")
      ),
      ["", "TOTAL", "", totBudget.toFixed(2), totCommitted.toFixed(2), totActual.toFixed(2), totVariance.toFixed(2), ""].join(","),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-cost-${projectName.replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (initialLoad) return <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white min-w-56"
        >
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="ml-auto">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FileDown size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Budget",    value: fmt(totBudget),    color: "text-gray-900" },
          { label: "Committed",       value: fmt(totCommitted), color: "text-[#4272EF]" },
          { label: "Actual Spend",    value: fmt(totActual),    color: "text-gray-900" },
          { label: "Remaining",       value: fmt(totVariance),  color: totVariance < 0 ? "text-red-600" : "text-green-600" },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-400 mb-1">{c.label}</p>
            <p className={`text-xl font-semibold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No cost codes for this project.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["Code", "Description", "Budget", "Committed", "Actual", "Variance", "% Used"].map((h) => (
                  <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide ${h === "Code" || h === "Description" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => {
                const variance = r.budget - r.actual;
                const usedPct = r.budget > 0 ? r.actual / r.budget : 0;
                const over = variance < 0;
                return (
                  <tr key={r.code} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{r.code}</td>
                    <td className="px-4 py-2.5 text-gray-800">{r.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{r.budget > 0 ? fmt(r.budget) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-right text-[#4272EF]">{r.committed > 0 ? fmt(r.committed) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-right text-gray-800 font-medium">{r.actual > 0 ? fmt(r.actual) : <span className="text-gray-300">—</span>}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${over ? "text-red-600" : r.actual > 0 ? "text-green-600" : "text-gray-300"}`}>
                      {r.budget > 0 || r.actual > 0 ? fmt(variance) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.budget > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${usedPct > 1 ? "bg-red-500" : usedPct > 0.8 ? "bg-amber-400" : "bg-green-500"}`}
                              style={{ width: `${Math.min(usedPct * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-9 text-right">{pct(r.actual, r.budget)}</span>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                <td colSpan={2} className="px-4 py-3 text-sm text-gray-700">Total</td>
                <td className="px-4 py-3 text-right text-gray-900">{fmt(totBudget)}</td>
                <td className="px-4 py-3 text-right text-[#4272EF]">{fmt(totCommitted)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{fmt(totActual)}</td>
                <td className={`px-4 py-3 text-right ${totVariance < 0 ? "text-red-600" : "text-green-600"}`}>{fmt(totVariance)}</td>
                <td className="px-4 py-3 text-right text-xs text-gray-500">{pct(totActual, totBudget)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
