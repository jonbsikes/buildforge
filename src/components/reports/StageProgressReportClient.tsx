"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ReportExportButtons from "@/components/ui/ReportExportButtons";
import StatusBadge, { type StatusKind } from "@/components/ui/StatusBadge";

interface Stage {
  stage_number: number;
  stage_name: string;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
}

interface Project {
  id: string;
  name: string;
  status: string;
  project_type: string;
  start_date: string | null;
  stages: Stage[];
}

const STATUS_KIND: Record<string, StatusKind> = {
  planning: "planned",
  active: "active",
  on_hold: "warning",
  completed: "complete",
  cancelled: "over",
};

export default function StageProgressReportClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("active");

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("projects").select("id, name, status, project_type, start_date").order("name"),
      supabase.from("build_stages")
        .select("project_id, stage_number, stage_name, status, planned_start_date, planned_end_date, actual_start_date")
        .order("stage_number"),
    ]).then(([projRes, stageRes]) => {
      const stagesByProject: Record<string, Stage[]> = {};
      for (const s of stageRes.data ?? []) {
        if (!stagesByProject[s.project_id]) stagesByProject[s.project_id] = [];
        stagesByProject[s.project_id]!.push(s);
      }
      setProjects(
        (projRes.data ?? []).map((p) => ({ ...p, stages: stagesByProject[p.id] ?? [] }))
      );
      setLoading(false);
    });
  }, []);

  const filtered = projects.filter((p) =>
    filterStatus === "all" ? true : p.status === filterStatus
  );

  function currentStage(stages: Stage[]): string {
    const active = stages.filter((s) => s.status !== "skipped");
    const inProgress = active.find((s) => s.status === "in_progress");
    if (inProgress) return inProgress.stage_name;
    const notStarted = active.find((s) => s.status === "not_started");
    if (notStarted) return notStarted.stage_name;
    const lastComplete = [...active].reverse().find((s) => s.status === "complete");
    return lastComplete ? lastComplete.stage_name : "—";
  }

  function daysInStage(stages: Stage[]): number | null {
    const s = stages.find((s) => s.status === "in_progress");
    if (!s?.actual_start_date) return null;
    const start = new Date(s.actual_start_date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((today.getTime() - start.getTime()) / 86400000);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex justify-end print:hidden"><ReportExportButtons slug="stage-progress" params={undefined} /></div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(["active", "planning", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 ${filterStatus === s ? "bg-[#4272EF] text-white" : "bg-white text-gray-600 hover:bg-gray-50"} transition-colors capitalize`}
            >
              {s === "all" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No projects match this filter.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const activeStages = p.stages.filter((s) => s.status !== "skipped");
            const total = activeStages.length;
            const complete = activeStages.filter((s) => s.status === "complete").length;
            const inProgress = activeStages.filter((s) => s.status === "in_progress").length;
            const pct = total > 0 ? (complete / total) * 100 : 0;
            const current = currentStage(p.stages);
            const days = daysInStage(p.stages);

            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 block hover:border-[#4272EF]/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 leading-tight">{p.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.project_type === "home_construction" ? "Home Construction" : "Land Development"}
                    </p>
                  </div>
                  <StatusBadge
                    status={STATUS_KIND[p.status] ?? "neutral"}
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {p.status.replace(/_/g, " ")}
                  </StatusBadge>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 text-xs text-gray-500">
                    <span>{complete} of {total} stages complete</span>
                    <span className="font-medium">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct === 100 ? "#22c55e" : "#4272EF",
                      }}
                    />
                  </div>
                  {inProgress > 0 && (
                    <div
                      className="h-0.5 rounded-full mt-0.5 bg-amber-400"
                      style={{ width: `${((complete + inProgress) / total) * 100}%` }}
                    />
                  )}
                </div>

                {/* Current stage */}
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-gray-400">Current stage: </span>
                    <span className="text-gray-700 font-medium">{current}</span>
                  </div>
                  {days !== null && (
                    <StatusBadge status={days > 14 ? "warning" : "neutral"} size="sm">
                      {days}d in stage
                    </StatusBadge>
                  )}
                </div>

                {/* Stage breakdown */}
                <div className="flex gap-3 text-xs text-gray-500 pt-1 border-t border-gray-50">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-complete)" }} /> {complete} done
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-active)" }} /> {inProgress} active
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-planned)" }} /> {total - complete - inProgress} pending
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
