"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, ChevronRight, FileDown, Circle, CheckCircle2 } from "lucide-react";
import ReportExportButtons from "@/components/ui/ReportExportButtons";

interface Todo {
  id: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
}

interface FieldLog {
  id: string;
  log_date: string;
  notes: string;
  project_id: string;
  projectName: string;
  todos: Todo[];
}

interface Project { id: string; name: string }

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-gray-400",
  normal: "text-blue-500",
  urgent: "text-red-500",
};

const DATE_PRESETS = [
  { label: "Last 7 days",  days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time",     days: 0 },
];

export default function FieldLogsReportClient() {
  const [logs, setLogs] = useState<FieldLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState("all");
  const [filterDays, setFilterDays] = useState(30);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("field_logs").select("id, log_date, notes, project_id").order("log_date", { ascending: false }),
      supabase.from("field_todos").select("id, field_log_id, description, status, priority, due_date"),
    ]).then(([projRes, logsRes, todosRes]) => {
      setProjects(projRes.data ?? []);
      const projectNames: Record<string, string> = {};
      for (const p of projRes.data ?? []) projectNames[p.id] = p.name;

      const todosByLog: Record<string, Todo[]> = {};
      for (const t of todosRes.data ?? []) {
        if (!t.field_log_id) continue;
        if (!todosByLog[t.field_log_id]) todosByLog[t.field_log_id] = [];
        todosByLog[t.field_log_id]!.push(t);
      }

      setLogs(
        (logsRes.data ?? []).map((l) => ({
          ...l,
          projectName: projectNames[l.project_id] ?? "—",
          todos: todosByLog[l.id] ?? [],
        }))
      );
      setLoading(false);
    });
  }, []);

  function cutoff(): string | null {
    if (!filterDays) return null;
    const d = new Date();
    d.setDate(d.getDate() - filterDays);
    return d.toISOString().split("T")[0]!;
  }

  const filtered = logs.filter((l) => {
    if (filterProject !== "all" && l.project_id !== filterProject) return false;
    const c = cutoff();
    if (c && l.log_date < c) return false;
    return true;
  });

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exportCSV() {
    const lines = [
      ["Date", "Project", "Notes", "Open Todos", "Done Todos"].join(","),
      ...filtered.map((l) => {
        const open = l.todos.filter((t) => t.status !== "done").length;
        const done = l.todos.filter((t) => t.status === "done").length;
        return ['"' + l.log_date + '"', '"' + l.projectName + '"', '"' + l.notes.replace(/"/g, "''") + '"', open, done].join(",");
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "field-logs.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex justify-end print:hidden"><ReportExportButtons slug="field-logs" params={{ projectId: filterProject !== 'all' ? filterProject : undefined }} /></div>
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
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.days}
              onClick={() => setFilterDays(preset.days)}
              className={"px-3 py-1.5 transition-colors " + (filterDays === preset.days ? "bg-[#4272EF] text-white" : "bg-white text-gray-600 hover:bg-gray-50")}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{filtered.length} log{filtered.length !== 1 ? "s" : ""}</span>
        <div className="ml-auto">
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <FileDown size={15} /> Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No field logs in this range.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {filtered.map((log) => {
            const isOpen = expanded.has(log.id);
            const openTodos = log.todos.filter((t) => t.status !== "done");
            const doneTodos = log.todos.filter((t) => t.status === "done");
            return (
              <div key={log.id}>
                <button
                  onClick={() => log.todos.length > 0 && toggle(log.id)}
                  className={"w-full flex items-start gap-4 px-5 py-4 text-left transition-colors " + (log.todos.length > 0 ? "hover:bg-gray-50 cursor-pointer" : "cursor-default")}
                >
                  <div className="w-24 flex-shrink-0">
                    <p className="text-xs font-mono text-gray-500">{log.log_date}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-[#4272EF]">{log.projectName}</span>
                      {log.todos.length > 0 && (
                        <span className={"text-xs px-1.5 py-0.5 rounded-full " + (openTodos.length > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>
                          {openTodos.length > 0 ? openTodos.length + " open" : doneTodos.length + " done"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{log.notes}</p>
                  </div>
                  {log.todos.length > 0 && (
                    <div className="flex-shrink-0 text-gray-400 mt-0.5">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  )}
                </button>

                {isOpen && log.todos.length > 0 && (
                  <div className="ml-28 mr-5 mb-3 pl-4 border-l border-gray-100 space-y-1.5">
                    {log.todos.map((t) => (
                      <div key={t.id} className="flex items-start gap-2 text-sm">
                        {t.status === "done"
                          ? <CheckCircle2 size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                          : <Circle size={14} className={"mt-0.5 flex-shrink-0 " + (PRIORITY_COLORS[t.priority] ?? "text-gray-400")} />
                        }
                        <span className={t.status === "done" ? "text-gray-400 line-through" : "text-gray-700"}>
                          {t.description}
                        </span>
                        {t.due_date && t.status !== "done" && (
                          <span className="ml-auto text-xs text-gray-400 flex-shrink-0">due {t.due_date}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
