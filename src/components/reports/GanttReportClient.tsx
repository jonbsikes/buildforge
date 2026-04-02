"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------
const LABEL_WIDTH = 200;
const ROW_HEIGHT  = 28;
const HEADER_H    = 40;

function parseDate(s: string): Date { return new Date(s + "T00:00:00"); }
function dayOffset(base: Date, dateStr: string): number {
  return Math.round((parseDate(dateStr).getTime() - base.getTime()) / 86400000);
}
function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

interface Stage {
  id: string;
  stage_number: number;
  stage_name: string;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
}

interface Project { id: string; name: string; project_type: string; start_date: string | null }

// ---------------------------------------------------------------------------
// Gantt for a single project — baseline (gray) behind actual/planned (colored)
// ---------------------------------------------------------------------------
function ProjectGantt({ project, stages }: { project: Project; stages: Stage[] }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [timelineW, setTimelineW] = useState(600);

  useEffect(() => {
    const node = outerRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setTimelineW(Math.max(1, node.clientWidth - LABEL_WIDTH)));
    ro.observe(node);
    setTimelineW(Math.max(1, node.clientWidth - LABEL_WIDTH));
    return () => ro.disconnect();
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = project.start_date ? parseDate(project.start_date) : today;

  // Determine timeline span
  let totalDays = 152;
  for (const s of stages) {
    for (const d of [s.planned_end_date, s.actual_end_date, s.baseline_end_date]) {
      if (d) totalDays = Math.max(totalDays, dayOffset(base, d) + 1);
    }
  }
  totalDays = Math.max(totalDays, 30);

  const dayWidth = timelineW / totalDays;
  const innerMinWidth = totalDays * dayWidth + LABEL_WIDTH;
  const todayOff = dayOffset(base, today.toISOString().split("T")[0]);

  const monthMarkers: { label: string; x: number }[] = [];
  {
    let d = new Date(base);
    d.setDate(1);
    if (d < base) d.setMonth(d.getMonth() + 1);
    while (dayOffset(base, d.toISOString().split("T")[0]) < totalDays) {
      const off = dayOffset(base, d.toISOString().split("T")[0]);
      monthMarkers.push({ label: fmtMonthYear(d), x: off * dayWidth });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  }

  return (
    <div ref={outerRef} className="border border-gray-200 rounded-xl bg-white overflow-hidden mb-6">
      {/* Project header */}
      <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
        <h3 className="text-sm font-semibold text-white">{project.name}</h3>
        <p className="text-xs text-blue-200">{project.project_type === "home_construction" ? "Home Construction" : "Land Development"}</p>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: innerMinWidth }}>
          {/* Header */}
          <div className="flex" style={{ height: HEADER_H }}>
            <div className="sticky left-0 z-10 bg-white border-r border-b border-gray-200 flex items-end pb-1 px-3 flex-shrink-0" style={{ width: LABEL_WIDTH }}>
              <span className="text-xs font-medium text-gray-400">Stage</span>
            </div>
            <div className="flex-1 relative bg-white border-b border-gray-200">
              {monthMarkers.map((m) => (
                <div key={m.x} className="absolute bottom-1 text-[10px] text-gray-400 whitespace-nowrap" style={{ left: m.x + 4 }}>
                  {m.label}
                </div>
              ))}
              {monthMarkers.map((m) => (
                <div key={`l${m.x}`} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: m.x }} />
              ))}
            </div>
          </div>

          {/* Stage rows */}
          {stages.map((s) => {
            const hasBaseline = s.baseline_start_date && s.baseline_end_date;
            const hasActual   = s.actual_start_date && s.actual_end_date;
            const hasPlanned  = s.planned_start_date && s.planned_end_date;

            // Planned or actual bar (front)
            const frontStart = hasActual ? s.actual_start_date! : (hasPlanned ? s.planned_start_date! : null);
            const frontEnd   = hasActual ? s.actual_end_date!   : (hasPlanned ? s.planned_end_date!   : null);
            const frontColor = hasActual
              ? (s.status === "complete" ? "bg-green-500" : "bg-[#4272EF]")
              : "bg-gray-300";

            const baseStartOff = hasBaseline ? dayOffset(base, s.baseline_start_date!) : null;
            const baseEndOff   = hasBaseline ? dayOffset(base, s.baseline_end_date!)   : null;
            const frontStartOff = frontStart ? dayOffset(base, frontStart) : null;
            const frontEndOff   = frontEnd   ? dayOffset(base, frontEnd)   : null;

            return (
              <div key={s.id} className="flex" style={{ height: ROW_HEIGHT }}>
                <div className="sticky left-0 z-10 bg-white border-r border-b border-gray-100 flex items-center px-3 flex-shrink-0" style={{ width: LABEL_WIDTH }}>
                  <span className="text-xs text-gray-400 w-6 flex-shrink-0 font-mono">{s.stage_number}</span>
                  <span className="text-xs text-gray-700 truncate ml-1">{s.stage_name}</span>
                </div>
                <div className="flex-1 relative border-b border-gray-100">
                  {/* Today line */}
                  {todayOff >= 0 && todayOff <= totalDays && (
                    <div className="absolute top-0 bottom-0 border-l-2 border-[#4272EF] opacity-30 pointer-events-none z-10" style={{ left: todayOff * dayWidth }} />
                  )}

                  {/* Baseline bar (behind, translucent) */}
                  {baseStartOff != null && baseEndOff != null && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 rounded bg-gray-200 opacity-70"
                      style={{ left: baseStartOff * dayWidth, width: Math.max((baseEndOff - baseStartOff + 1) * dayWidth, 4), height: 18 }}
                      title={`Baseline: ${s.baseline_start_date} → ${s.baseline_end_date}`}
                    />
                  )}

                  {/* Planned/actual bar (front) */}
                  {frontStartOff != null && frontEndOff != null && (
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 rounded ${frontColor} opacity-90`}
                      style={{ left: frontStartOff * dayWidth, width: Math.max((frontEndOff - frontStartOff + 1) * dayWidth, 4), height: 14 }}
                      title={`${hasActual ? "Actual" : "Planned"}: ${frontStart} → ${frontEnd}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-gray-200 inline-block" /> Baseline</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-gray-300 inline-block" /> Planned</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-[#4272EF] inline-block" /> In Progress (Actual)</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 rounded bg-green-500 inline-block" /> Complete (Actual)</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function GanttReportClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stagesByProject, setStagesByProject] = useState<Record<string, Stage[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState("all");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [projectsRes, stagesRes] = await Promise.all([
        supabase.from("projects").select("id, name, project_type, start_date").order("name"),
        supabase.from("build_stages")
          .select("id, project_id, stage_number, stage_name, status, planned_start_date, planned_end_date, actual_start_date, actual_end_date, baseline_start_date, baseline_end_date")
          .order("stage_number"),
      ]);

      const byProject: Record<string, Stage[]> = {};
      for (const s of stagesRes.data ?? []) {
        if (!byProject[s.project_id]) byProject[s.project_id] = [];
        byProject[s.project_id]!.push(s);
      }

      setProjects(projectsRes.data ?? []);
      setStagesByProject(byProject);
      setLoading(false);
    }
    load();
  }, []);

  const displayedProjects = selectedProject === "all"
    ? projects
    : projects.filter((p) => p.id === selectedProject);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white min-w-48"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="ml-auto">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <FileDown size={15} /> Export PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : displayedProjects.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No projects found.</div>
      ) : (
        displayedProjects.map((p) => (
          <ProjectGantt
            key={p.id}
            project={p}
            stages={stagesByProject[p.id] ?? []}
          />
        ))
      )}
    </div>
  );
}
