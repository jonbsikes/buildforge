"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, RotateCcw, Check, AlertTriangle, ChevronDown, ChevronRight, SkipForward } from "lucide-react";
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

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete",    label: "Complete" },
  { value: "delayed",     label: "Delayed" },
  { value: "skipped",     label: "Skipped" },
];

const STATUS_STYLES: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  complete:    "bg-green-100 text-green-700",
  completed:   "bg-green-100 text-green-700",
  delayed:     "bg-red-100 text-red-600",
  skipped:     "bg-orange-50 text-orange-400 line-through",
};

const TRACK_STYLES: Record<string, string> = {
  Exterior: "bg-sky-100 text-sky-700",
  exterior: "bg-sky-100 text-sky-700",
  Interior: "bg-violet-100 text-violet-700",
  interior: "bg-violet-100 text-violet-700",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateShort(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function isDelayed(stage: StageRow): boolean {
  if (!stage.planned_end_date) return false;
  if (stage.status === "complete" || stage.status === "completed" || stage.status === "skipped") return false;
  return new Date(stage.planned_end_date + "T00:00:00") < new Date(new Date().toDateString());
}

function varianceLabel(stage: StageRow): string {
  if (!stage.actual_end_date || !stage.planned_end_date) return "—";
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

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function hasOutOfSpecDates(stages: StageRow[], startDate: string | null): boolean {
  if (!startDate) return false;
  const stage55 = stages.find((s) => s.stage_number === 55);
  if (!stage55 || !stage55.planned_end_date) return false;
  const expectedEnd = addDaysStr(startDate, 151);
  return stage55.planned_end_date !== expectedEnd;
}

// ── Mobile edit sheet ───────────────────────────────────────────────────────
function MobileEditSheet({ stage, projectId, onClose }: { stage: StageRow; projectId: string; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState({
    actual_start_date: stage.actual_start_date ?? "",
    actual_end_date: stage.actual_end_date ?? "",
    status: stage.status,
    notes: stage.notes ?? "",
  });

  function set<K extends keyof typeof fields>(key: K, val: string) {
    setFields((prev) => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateStage(stage.id, {
        actual_start_date: fields.actual_start_date || null,
        actual_end_date: fields.actual_end_date || null,
        status: fields.status,
        notes: fields.notes || null,
      }, projectId);
      if (result.error) setError(result.error);
      else { router.refresh(); onClose(); }
    });
  }

  return (
    <div className="bg-blue-50/50 border-t border-blue-100 px-4 py-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Actual Start</label>
          <input type="date" value={fields.actual_start_date} onChange={(e) => set("actual_start_date", e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 bg-white min-h-[44px]" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Actual End</label>
          <input type="date" value={fields.actual_end_date} onChange={(e) => set("actual_end_date", e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 bg-white min-h-[44px]" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Status</label>
        <select value={fields.status} onChange={(e) => set("status", e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 bg-white min-h-[44px]">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Notes</label>
        <input type="text" value={fields.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 bg-white min-h-[44px]" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={handleSave} disabled={isPending}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-sm bg-[#4272EF] text-white rounded-lg font-semibold active:bg-[#3461de] disabled:opacity-60 transition-colors min-h-[48px]">
          <Check size={15} /> {isPending ? "Saving…" : "Save"}
        </button>
        <button onClick={onClose} disabled={isPending}
          className="px-4 py-3 text-sm border border-gray-200 text-gray-600 rounded-lg font-medium active:bg-gray-100 transition-colors min-h-[48px]">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Desktop inline edit form (table row) ────────────────────────────────────
function DesktopEditForm({ stage, projectId, onClose }: { stage: StageRow; projectId: string; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState({
    actual_start_date: stage.actual_start_date ?? "",
    actual_end_date: stage.actual_end_date ?? "",
    status: stage.status,
    notes: stage.notes ?? "",
  });

  function set<K extends keyof typeof fields>(key: K, val: string) {
    setFields((prev) => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateStage(stage.id, {
        actual_start_date: fields.actual_start_date || null,
        actual_end_date: fields.actual_end_date || null,
        status: fields.status,
        notes: fields.notes || null,
      }, projectId);
      if (result.error) setError(result.error);
      else { router.refresh(); onClose(); }
    });
  }

  return (
    <tr className="bg-blue-50/40">
      <td colSpan={99} className="px-4 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Actual Start</label>
            <input type="date" value={fields.actual_start_date} onChange={(e) => set("actual_start_date", e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Actual End</label>
            <input type="date" value={fields.actual_end_date} onChange={(e) => set("actual_end_date", e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select value={fields.status} onChange={(e) => set("status", e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input type="text" value={fields.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes…"
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30" />
          </div>
        </div>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] disabled:opacity-60 transition-colors">
            <Check size={12} /> {isPending ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            <X size={12} /> Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Reset Schedule button ───────────────────────────────────────────────────
function ResetScheduleButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetSchedule(projectId);
      if (result.error) setError(result.error);
      else { setConfirm(false); router.refresh(); }
    });
  }

  if (!confirm) {
    return (
      <div>
        <button onClick={() => setConfirm(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg active:bg-gray-100 hover:bg-gray-50 hover:text-gray-700 transition-colors min-h-[36px]">
          <RotateCcw size={13} /> Reset Schedule
        </button>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">Reset all planned dates?</span>
      <button onClick={handleReset} disabled={isPending}
        className="px-3 py-2 text-xs bg-amber-500 text-white rounded-lg active:bg-amber-600 disabled:opacity-60 transition-colors min-h-[36px]">
        {isPending ? "Resetting…" : "Yes, Reset"}
      </button>
      <button onClick={() => setConfirm(false)} disabled={isPending}
        className="px-3 py-2 text-xs border border-gray-300 text-gray-600 rounded-lg active:bg-gray-100 transition-colors min-h-[36px]">
        Cancel
      </button>
    </div>
  );
}

// ── Mobile stage card ───────────────────────────────────────────────────────
function MobileStageCard({
  stage, projectId, isEditing, onToggleEdit, onComplete, onSkip, completing,
}: {
  stage: StageRow; projectId: string; isEditing: boolean;
  onToggleEdit: () => void; onComplete: () => void; onSkip: () => void; completing: boolean;
}) {
  const delayed = isDelayed(stage);
  const isComplete = stage.status === "complete" || stage.status === "completed";
  const isSkipped = stage.status === "skipped";
  const canAction = !isComplete && !isSkipped;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${
      delayed ? "border-red-200 bg-red-50/30" :
      stage.status === "in_progress" ? "border-blue-200" :
      "border-gray-100"
    } ${isSkipped ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-3 px-4 py-3.5 min-h-[60px]">
        {/* Stage number */}
        <span className="text-xs text-gray-400 font-mono w-6 shrink-0 text-center">{stage.stage_number}</span>

        {/* Stage info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${isComplete ? "text-green-700" : isSkipped ? "text-gray-400 line-through" : "text-gray-900"}`}>
              {stage.stage_name}
            </span>
            {stage.track && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TRACK_STYLES[stage.track] ?? "bg-gray-100 text-gray-600"}`}>
                {stage.track}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLES[stage.status] ?? "bg-gray-100 text-gray-600"}`}>
              {stage.status.replace(/_/g, " ")}
            </span>
            {delayed && <span className="text-[10px] text-red-500 font-medium">Overdue</span>}
            {stage.planned_start_date && (
              <span className="text-[10px] text-gray-400">
                {fmtDateShort(stage.planned_start_date)} — {fmtDateShort(stage.planned_end_date)}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons — large touch targets */}
        {canAction && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onComplete}
              disabled={completing}
              className="w-11 h-11 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center active:bg-green-100 disabled:opacity-50 transition-colors"
              title="Mark complete"
              aria-label="Mark complete"
            >
              <Check size={18} className="text-green-600" />
            </button>
            <button
              onClick={onToggleEdit}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                isEditing ? "bg-blue-100 border border-blue-300" : "bg-gray-50 border border-gray-200 active:bg-gray-100"
              }`}
              title="Edit stage"
              aria-label="Edit stage"
            >
              {isEditing ? <X size={16} className="text-[#4272EF]" /> : <Pencil size={15} className="text-gray-500" />}
            </button>
            <button
              onClick={onSkip}
              disabled={completing}
              className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center active:bg-gray-100 disabled:opacity-50 transition-colors"
              title="Skip"
              aria-label="Skip stage"
            >
              <SkipForward size={15} className="text-gray-400" />
            </button>
          </div>
        )}

        {isComplete && (
          <button onClick={onToggleEdit}
            className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center active:bg-gray-100 transition-colors shrink-0">
            <Pencil size={15} className="text-gray-400" />
          </button>
        )}
      </div>

      {isEditing && <MobileEditSheet stage={stage} projectId={projectId} onClose={onToggleEdit} />}
    </div>
  );
}

// ── Main component ───────────────────────�