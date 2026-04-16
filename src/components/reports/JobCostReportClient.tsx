"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

interface Project {
  id: string;
  name: string;
  project_type: string;
  subdivision: string | null;
  status: string;
}

interface CostCode {
  id: string;
  code: string;
  name: string;
  project_type: string | null;
}

// cost_code (string) → { projectId → actual amount }
type ActualsMap = Record<string, Record<string, number>>;

const STATUS_LABELS: Record<string, string> = {
  active: "In Progress",
  completed: "Completed",
  pre_construction: "Pre-Construction",
  on_hold: "On Hold",
  planning: "Planning",
  cancelled: "Cancelled",
};

const TYPE_LABELS: Record<string, string> = {
  home_construction: "Home Construction",
  land_development: "Land Development",
};

export default function JobCostReportClient() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [actuals, setActuals] = useState<ActualsMap>({});
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  // Filters
  const [projectType, setProjectType] = useState<string>("home_construction");
  const [subdivision, setSubdivision] = useState<string>("all");
  const [status, setStatus] = useState<string>("active");

  // Load projects and cost codes on mount
  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("projects")
        .select("id, name, project_type, subdivision, status")
        .in("project_type", ["home_construction", "land_development"])
        .order("name"),
      supabase
        .from("cost_codes")
        .select("id, code, name, project_type")
        .eq("is_active", true)
        .order("sort_order"),
    ]).then(([projRes, ccRes]) => {
      setAllProjects(projRes.data ?? []);
      setCostCodes(ccRes.data ?? []);
      setLoading(false);
    });
  }, []);

  // Derive filter options
  const subdivisions = useMemo(() => {
    const subs = new Set<string>();
    allProjects
      .filter((p) => p.project_type === projectType && p.subdivision)
      .forEach((p) => subs.add(p.subdivision!));
    return Array.from(subs).sort();
  }, [allProjects, projectType]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    allProjects
      .filter((p) => p.project_type === projectType)
      .forEach((p) => s.add(p.status));
    return Array.from(s).sort();
  }, [allProjects, projectType]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return allProjects.filter((p) => {
      if (p.project_type !== projectType) return false;
      if (status !== "all" && p.status !== status) return false;
      if (subdivision !== "all" && p.subdivision !== subdivision) return false;
      return true;
    });
  }, [allProjects, projectType, status, subdivision]);

  // Filtered cost codes for the selected type
  const filteredCostCodes = useMemo(() => {
    return costCodes.filter((cc) => cc.project_type === projectType);
  }, [costCodes, projectType]);

  // Reset subdivision when type changes
  useEffect(() => {
    setSubdivision("all");
  }, [projectType]);

  // Build cost_code_id → code lookup
  const ccIdToCode = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cc of costCodes) map[cc.id] = cc.code;
    return map;
  }, [costCodes]);

  // Fetch actuals when filtered projects change
  useEffect(() => {
    if (filteredProjects.length === 0) {
      setActuals({});
      return;
    }
    setDataLoading(true);
    const supabase = createClient();
    const projectIds = filteredProjects.map((p) => p.id);

    Promise.all([
      // Invoice line items
      supabase
        .from("invoice_line_items")
        .select("cost_code, amount, project_id, invoice:invoices!inner(status)")
        .in("project_id", projectIds)
        .in("invoice.status", ["approved", "released", "cleared"]),
      // Journal entry lines (manual JEs, lot costs, etc.)
      supabase
        .from("journal_entry_lines")
        .select("cost_code_id, project_id, debit, credit, journal_entry:journal_entries!inner(status, source_type)")
        .in("project_id", projectIds)
        .not("cost_code_id", "is", null),
    ]).then(([invRes, jeRes]) => {
      const map: ActualsMap = {};

      // Add invoice line item actuals
      for (const row of invRes.data ?? []) {
        if (!row.cost_code || !row.project_id) continue;
        if (!map[row.cost_code]) map[row.cost_code] = {};
        map[row.cost_code][row.project_id] =
          (map[row.cost_code][row.project_id] ?? 0) + (row.amount ?? 0);
      }

      // Add JE-based actuals (skip invoice-related to avoid double-counting)
      for (const row of jeRes.data ?? []) {
        const je = row.journal_entry as any;
        if (!je || je.status !== "posted") continue;
        if (je.source_type === "invoice_approval" || je.source_type === "invoice_payment") continue;
        if (!row.cost_code_id || !row.project_id) continue;

        const code = ccIdToCode[row.cost_code_id];
        if (!code) continue;

        const amount = (row.debit ?? 0) - (row.credit ?? 0);
        if (amount === 0) continue;

        if (!map[code]) map[code] = {};
        map[code][row.project_id] = (map[code][row.project_id] ?? 0) + amount;
      }

      setActuals(map);
      setDataLoading(false);
    });
  }, [filteredProjects, ccIdToCode]);

  // Build table data
  const rows = useMemo(() => {
    return filteredCostCodes.map((cc) => {
      const projectActuals: Record<string, number> = actuals[cc.code] ?? {};
      const total = Object.values(projectActuals).reduce((s, v) => s + v, 0);
      return { code: cc.code, name: cc.name, projectActuals, total };
    });
  }, [filteredCostCodes, actuals]);

  // Only show rows that have at least one non-zero actual, or show all if nothing has actuals
  const visibleRows = useMemo(() => {
    const withActuals = rows.filter((r) => r.total > 0);
    return withActuals.length > 0 ? rows : rows;
  }, [rows]);

  // Project totals
  const projectTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const p of filteredProjects) {
      totals[p.id] = visibleRows.reduce(
        (s, r) => s + (r.projectActuals[p.id] ?? 0),
        0
      );
    }
    return totals;
  }, [filteredProjects, visibleRows]);

  const grandTotal = Object.values(projectTotals).reduce((s, v) => s + v, 0);

  function exportCSV() {
    const headers = [
      "Code",
      "Description",
      ...filteredProjects.map((p) => `"${p.name}"`),
      "Total",
    ];
    const lines = [
      headers.join(","),
      ...visibleRows.map((r) =>
        [
          r.code,
          `"${r.name}"`,
          ...filteredProjects.map((p) => (r.projectActuals[p.id] ?? 0).toFixed(2)),
          r.total.toFixed(2),
        ].join(",")
      ),
      [
        "",
        "TOTAL",
        ...filteredProjects.map((p) => (projectTotals[p.id] ?? 0).toFixed(2)),
        grandTotal.toFixed(2),
      ].join(","),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-cost-comparison-${TYPE_LABELS[projectType]?.replace(/\s+/g, "-") ?? projectType}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-full mx-auto space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select
          value={projectType}
          onChange={(e) => setProjectType(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          {Object.entries(TYPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        {projectType === "home_construction" && subdivisions.length > 0 && (
          <select
            value={subdivision}
            onChange={(e) => setSubdivision(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">All Subdivisions</option>
            {subdivisions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="all">All Statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>

        <div className="ml-auto">
          <button
            onClick={exportCSV}
            disabled={filteredProjects.length === 0}
            className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <FileDown size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Results info */}
      <p className="text-xs text-gray-400">
        {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
      </p>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {dataLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No projects match the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide text-left sticky left-0 bg-gray-50 z-10 min-w-[200px]">
                    Description
                  </th>
                  {filteredProjects.map((p) => (
                    <th
                      key={p.id}
                      className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide text-right whitespace-nowrap min-w-[120px]"
                    >
                      {p.name}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide text-right min-w-[120px]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleRows.map((r) => (
                  <tr key={r.code} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 text-gray-800 sticky left-0 bg-white z-10">
                      <span className="text-xs font-mono text-gray-400 mr-2">{r.code}</span>
                      {r.name}
                    </td>
                    {filteredProjects.map((p) => {
                      const val = r.projectActuals[p.id] ?? 0;
                      return (
                        <td key={p.id} className="px-4 py-2 text-right text-gray-700 tabular-nums">
                          {val > 0 ? fmt(val) : <span className="text-gray-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right font-medium text-gray-900 tabular-nums">
                      {r.total > 0 ? fmt(r.total) : <span className="text-gray-200">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-700 sticky left-0 bg-gray-50 z-10">
                    Total
                  </td>
                  {filteredProjects.map((p) => (
                    <td key={p.id} className="px-4 py-3 text-right text-gray-900 tabular-nums">
                      {fmt(projectTotals[p.id] ?? 0)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-gray-900 tabular-nums">
                    {fmt(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
