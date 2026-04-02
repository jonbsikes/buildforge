"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, RotateCcw, Check, AlertTriangle } from "lucide-react";
import { updateStage, resetSchedule } from "@/app/actions/stages";

export interface StageRow {
  id: string;
  stage_number: number;
  stage_name: string;
  track: string | null;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  notes: string | null;
}

interface Props {
  stages: StageRow[];
  projectId: string;
  isHome: boolean;
  startDate: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete",    label: "Complete" },
  { value: "delayed",     label: "Delayed" },
];

const STATUS_STYLES: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  complete:    "bg-green-100 text-green-700",
  completed:   "bg-green-100 text-green-700",
  delayed:     "bg-red-100 text-red-600",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function isDelayed(stage: StageRow): boolean {
  if (!stage.planned_end_date) return false;
  if (stage.status === "complete" || stage.status === "completed") return false;
  return new Date(stage.planned_end_date + "T00:00:00") < new Date(new Date().toDateString());
}

function varianceLabel(stage: StageRow): string {
  if (!stage.actual_end_date || !stage.planned_end_date) return "—";
  // positive = finished before planned (ahead), negative = behind
  const v = daysBetween(stage.actual_end_date, stage.planned_end_date);
  if (v === 0) return "On time";
  return v > 0 ? `+${v}d` : `${v}d`;
}

function varianceClass(stage: StageRow): string {
  if (!stage.actual_end_date || !stage.planned_end_date) return "text-gray-400";
  const v = daysBetween(stage.actual_end_date, stage.planned_end_date);
  if (v > 0) return "text-green-600 font-medium";
  if (v < 0) return "text-red-600 font-medium";
  return "text-gray-500";
}

// ---------------------------------------------------------------------------
// Inline edit form
// ---------------------------------------------------------------------------

interface EditFormProps {
  stage: StageRow;
  projectId: string;
  onClose: () => void;
}

function EditForm({ stage, projectId, onClose }: EditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState({
    actual_start_date: stage.actual_start_date ?? "",
    actual_end_date:   stage.actual_end_date   ?? "",
    status:            stage.status,
    notes:             stage.notes             ?? "",
  });

  function set<K extends keyof typeof fields>(key: K, val: string) {
    setFields((prev) => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateStage(
        stage.id,
        {
          actual_start_date: fields.actual_start_date || null,
          actual_end_date:   fields.actual_end_date   || null,
          status:            fields.status,
          notes:             fields.notes             || null,
        },
        projectId
      );

      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <tr className="bg-blue-50/40">
      <td colSpan={99} className="px-4 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Actual Start</label>
            <input
              type="date"
              value={fields.actual_start_date}
              onChange={(e) => set("actual_start_date", e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Actual End</label>
            <input
              type="date"
              value={fields.actual_end_date}
              onChange={(e) => set("actual_end_date", e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={fields.status}
              onChange={(e) => set("status", e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input
              type="text"
              value={fields.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional notes…"
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] disabled:opacity-60 transition-colors"
          >
            <Check size={12} />
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <X size={12} />
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Reset Schedule button
// ---------------------------------------------------------------------------

function ResetScheduleButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetSchedule(projectId);
      if (result.error) {
        setError(result.error);
      } else {
        setConfirm(false);
        router.refresh();
      }
    });
  }

  if (!confirm) {
    return (
      <div>
        <button
          onClick={() => setConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <RotateCcw size={13} />
          Reset Schedule
        </button>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Reset all planned dates from start date?</span>
      <button
        onClick={handleReset}
        disabled={isPending}
        className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors"
      >
        {isPending ? "Resetting…" : "Yes, Reset"}
      </button>
      <button
        onClick={() => setConfirm(false)}
        disabled={isPending}
        className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date correctness detection
// Home construction schedule is 152 days: start_date + 151 = final planned_end_date.
// If stage 54's planned_end_date doesn't match, the stored dates are stale.
// ---------------------------------------------------------------------------

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function hasOutOfSpecDates(stages: StageRow[], startDate: string | null): boolean {
  if (!startDate) return false;
  const stage54 = stages.find((s) => s.stage_number === 54);
  if (!stage54 || !stage54.planned_end_date) return false;
  const expectedEnd = addDaysStr(startDate, 151); // day 152 = offset 151
  return stage54.planned_end_date !== expectedEnd;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StageReportTab({ stages, projectId, isHome, startDate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (stages.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-400 text-center py-8">
          No build stages have been created for this project yet.
        </p>
        <div className="flex justify-center">
          <ResetScheduleButton projectId={projectId} />
        </div>
      </div>
    );
  }

  const complete = stages.filter(
    (s) => s.status === "complete" || s.status === "completed"
  ).length;
  const pct = Math.round((complete / stages.length) * 100);

  const outOfSpec = isHome && hasOutOfSpecDates(stages, startDate);

  return (
    <div className="space-y-4">
      {/* Out-of-spec date warning */}
      {outOfSpec && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Build schedule dates are out of sync</p>
            <p className="mt-0.5 text-amber-700 text-xs">
              Stage dates don&apos;t match the master 152-day schedule (start + 151 days for Stage 54).
              Click <span className="font-semibold">Reset Schedule</span> to recalculate all planned dates from the project start date.
            </p>
          </div>
        </div>
      )}

      {/* Progress bar + reset */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex-1 bg-gray-100 rounded-full h-2">
            <div
              className="bg-[#4272EF] h-2 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">
            {complete}/{stages.length} complete ({pct}%)
          </span>
        </div>
        <ResetScheduleButton projectId={projectId} />
      </div>

      {/* Stage table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider w-8">#</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Stage</th>
              {isHome && (
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Track</th>
              )}
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Planned Start</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Planned End</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Actual Start</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Actual End</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Variance</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stages.map((stage) => {
              const delayed = isDelayed(stage);
              const editing = editingId === stage.id;

              return (
                <Fragment key={stage.id}>
                  <tr
                    className={`hover:bg-gray-50 transition-colors ${
                      delayed ? "bg-amber-50/60" : ""
                    } ${editing ? "bg-blue-50/40" : ""}`}
                  >
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{stage.stage_number}</td>
                    <td className="px-3 py-2.5 text-gray-900 font-medium">
                      {stage.stage_name}
                      {stage.notes && (
                        <p className="text-xs text-gray-400 font-normal mt-0.5 truncate max-w-[200px]">
                          {stage.notes}
                        </p>
                      )}
                    </td>
                    {isHome && (
                      <td className="px-3 py-2.5">
                        {stage.track ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            stage.track === "exterior"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-violet-100 text-violet-700"
                          }`}>
                            {stage.track}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_STYLES[stage.status] ?? "bg-gray-100 text-gray-600"
                      }`}>
                        {stage.status.replace(/_/g, " ")}
                      </span>
                      {delayed && (
                        <span className="ml-1.5 text-xs text-amber-600 font-medium">⚠ Delayed</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(stage.planned_start_date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(stage.planned_end_date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(stage.actual_start_date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(stage.actual_end_date)}</td>
                    <td className={`px-3 py-2.5 text-xs ${varianceClass(stage)}`}>{varianceLabel(stage)}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setEditingId(editing ? null : stage.id)}
                        className={`p-1 rounded transition-colors ${
                          editing
                            ? "text-[#4272EF] bg-blue-100"
                            : "text-gray-400 hover:text-[#4272EF] hover:bg-blue-50"
                        }`}
                        title={editing ? "Close edit" : "Edit stage"}
                      >
                        {editing ? <X size={13} /> : <Pencil size={13} />}
                      </button>
                    </td>
                  </tr>

                  {editing && (
                    <EditForm
                      stage={stage}
                      projectId={projectId}
                      onClose={() => setEditingId(null)}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
