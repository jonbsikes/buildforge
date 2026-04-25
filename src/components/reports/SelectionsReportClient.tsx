"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown } from "lucide-react";
import ReportExportButtons from "@/components/ui/ReportExportButtons";
import StatusBadge, { type StatusKind } from "@/components/ui/StatusBadge";

interface Selection {
  id: string;
  project_id: string;
  projectName: string;
  category: string;
  item_name: string;
  status: string;
  notes: string | null;
}

interface Project { id: string; name: string }

const STATUS_KIND: Record<string, StatusKind> = {
  pending: "planned",
  selected: "active",
  ordered: "warning",
  delivered: "neutral",
  installed: "complete",
};
const STATUS_DOT: Record<string, string> = {
  pending: "var(--status-planned)",
  selected: "var(--status-active)",
  ordered: "var(--status-warning)",
  delivered: "var(--status-info, var(--status-warning))",
  installed: "var(--status-complete)",
};

const STATUSES = ["pending", "selected", "ordered", "delivered", "installed"];

export default function SelectionsReportClient() {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("selections").select("id, project_id, category, item_name, status, notes").order("category"),
    ]).then(([projRes, selRes]) => {
      setProjects(projRes.data ?? []);
      const names: Record<string, string> = {};
      for (const p of projRes.data ?? []) names[p.id] = p.name;
      setSelections(
        (selRes.data ?? []).map((s) => ({ ...s, projectName: names[s.project_id] ?? "—" }))
      );
      setLoading(false);
    });
  }, []);

  const categories = Array.from(new Set(selections.map((s) => s.category))).sort();

  const filtered = selections.filter((s) => {
    if (filterProject !== "all" && s.project_id !== filterProject) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (filterCategory !== "all" && s.category !== filterCategory) return false;
    return true;
  });

  // Group by project then category
  const grouped: Record<string, Record<string, Selection[]>> = {};
  for (const s of filtered) {
    if (!grouped[s.projectName]) grouped[s.projectName] = {};
    if (!grouped[s.projectName]![s.category]) grouped[s.projectName]![s.category] = [];
    grouped[s.projectName]![s.category]!.push(s);
  }

  const statusCounts = STATUSES.reduce((acc, st) => {
    acc[st] = filtered.filter((s) => s.status === st).length;
    return acc;
  }, {} as Record<string, number>);

  function exportCSV() {
    const lines = [
      ["Project", "Category", "Item", "Status", "Notes"].join(","),
      ...filtered.map((s) =>
        [`"${s.projectName}"`, `"${s.category}"`, `"${s.item_name}"`, s.status, `"${s.notes ?? ""}"`].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "selections.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex justify-end print:hidden"><ReportExportButtons slug="selections" params={{ projectId: filterProject !== 'all' ? filterProject : undefined }} /></div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white min-w-48"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="all">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="ml-auto">
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <FileDown size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(filterStatus === st ? "all" : st)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filterStatus === st ? "border-[#4272EF] bg-[#4272EF]/10 text-[#4272EF]" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_DOT[st] ?? "var(--status-neutral)" }} />
            {st.charAt(0).toUpperCase() + st.slice(1)}
            <span className="font-bold">{statusCounts[st] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No selections match these filters.</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([projectName, byCategory]) => (
            <div key={projectName} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-800">{projectName}</h3>
              </div>
              {Object.entries(byCategory).map(([category, items]) => (
                <div key={category}>
                  <div className="px-5 py-2 bg-gray-50/50 border-b border-gray-50">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{category}</p>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {items.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-2.5 text-gray-800 font-medium">{s.item_name}</td>
                          <td className="px-4 py-2.5 w-28">
                            <StatusBadge status={STATUS_KIND[s.status] ?? "neutral"} size="sm">
                              {s.status}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-gray-400 max-w-xs truncate">
                            {s.notes ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
