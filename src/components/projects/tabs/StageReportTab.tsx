"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, RotateCcw, Check, AlertTriangle, ChevronDown, ChevronRight, Play, Settings2 } from "lucide-react";
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
  if (!d) return "\u2014";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateShort(d: string | null): string {
  if (!d) return "\u2014";
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
  if (!stage.actual_end_date || !stage.planned_end_date) return "\u2014";
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

function sortStagesForDisplay(stages: StageRow[]): StageRow[] {
  const order: Record<string, number> = {
    in_progress: 0, delayed: 1, not_started: 2, complete: 3, completed: 3, skipped: 4,
  };
  return [...stages].sort((a, b) => {
    const aDelayed = isDelayed(a) && a.status !== "in_progress";
    const bDelayed = isDelayed(b) && b.status !== "in_progress";
    const aOrder = a.status === "in_progress" ? 0 : aDelayed ? 1 : (order[a.status] ?? 2);
    const bOrder = b.status === "in_progress" ? 0 : bDelayed ? 1 : (order[b.status] ?? 2);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.stage_number - b.stage_number;
  });
}

// -- Mobile edit sheet --
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

// -- Desktop inline edit form --
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

// -- Reset Schedule button --
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

// -- Edit Stages modal (desktop) --
function EditStagesModal({ stages, projectId, onClose }: { stages: StageRow[]; projectId: string; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const s of stages) { map[s.id] = s.status !== "skipped"; }
    return map;
  });

  function toggle(id: string) { setEnabled((prev) => ({ ...prev, [id]: !prev[id] })); }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const toSkip = stages.filter((s) => !enabled[s.id] && s.status !== "skipped");
      const toUnskip = stages.filter((s) => enabled[s.id] && s.status === "skipped");
      for (const s of toSkip) {
        const result = await updateStage(s.id, { actual_start_date: null, actual_end_date: null, status: "skipped", notes: s.notes || null }, projectId);
        if (result.error) { setError(result.error); return; }
      }
      for (const s of toUnskip) {
        const result = await updateStage(s.id, { actual_start_date: null, actual_end_date: null, status: "not_started", notes: s.notes || null }, projectId);
        if (result.error) { setError(result.error); return; }
      }
      router.refresh();
      onClose();
    });
  }

  const allByStageNumber = [...stages].sort((a, b) => a.stage_number - b.stage_number);
  const stageIsComplete = (s: StageRow) => s.status === "complete" || s.status === "completed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Edit Stages</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors"><X size={16} className="text-gray-400" /></button>
        </div>
        <p className="px-5 pt-3 text-xs text-gray-500">Uncheck stages that don&apos;t apply. Unchecked stages will be skipped and hidden from reports.</p>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="space-y-1">
            {allByStageNumber.map((s) => {
              const complete = stageIsComplete(s);
              return (
                <label key={s.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${!enabled[s.id] ? "opacity-50" : ""} ${complete ? "cursor-not-allowed" : ""}`}>
                  <input type="checkbox" checked={enabled[s.id]} onChange={() => !complete && toggle(s.id)} disabled={complete}
                    className="w-4 h-4 rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]/30 disabled:opacity-50" />
                  <span className="text-xs text-gray-400 font-mono w-6">{s.stage_number}</span>
                  <span className={`text-sm ${complete ? "text-green-700" : "text-gray-800"}`}>{s.stage_name}</span>
                  {s.track && (<span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto ${TRACK_STYLES[s.track] ?? "bg-gray-100 text-gray-600"}`}>{s.track}</span>)}
                  {complete && (<span className="text-[10px] text-green-600 font-medium ml-auto">Done</span>)}
                </label>
              );
            })}
          </div>
        </div>
        {error && <p className="text-xs text-red-600 px-5 pb-2">{error}</p>}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={handleSave} disabled={isPending}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm bg-[#4272EF] text-white rounded-lg font-semibold hover:bg-[#3461de] disabled:opacity-60 transition-colors">
            <Check size={14} /> {isPending ? "Saving…" : "Save Changes"}
          </button>
          <button onClick={onClose} disabled={isPending}
            className="px-4 py-2.5 text-sm border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// -- Mobile stage card --
function MobileStageCard({
  stage, projectId, isEditing, onToggleEdit, onComplete, onStart, completing,
}: {
  stage: StageRow; projectId: string; isEditing: boolean;
  onToggleEdit: () => void; onComplete: () => void; onStart: () => void; completing: boolean;
}) {
  const delayed = isDelayed(stage);
  const isComplete = stage.status === "complete" || stage.status === "completed";
  const isSkipped = stage.status === "skipped";
  const isInProgress = stage.status === "in_progress";
  const isNotStarted = stage.status === "not_started";
  const canAction = !isComplete && !isSkipped;

  return (
    <div className={`bg-white rounded-xl border-l-4 border overflow-hidden shadow-sm ${
      delayed ? "border-l-red-400 border-red-200 bg-red-50/20" :
      isInProgress ? "border-l-blue-500 border-blue-200 bg-blue-50/20" :
      isComplete ? "border-l-green-400 border-gray-100" :
      "border-l-gray-200 border-gray-100"
    } ${isSkipped ? "opacity-40" : ""}`}>
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-base font-semibold leading-tight ${
                isComplete ? "text-green-700" : isSkipped ? "text-gray-400 line-through" : "text-gray-900"
              }`}>
                {stage.stage_name}
              </span>
              {stage.track && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${TRACK_STYLES[stage.track] ?? "bg-gray-100 text-gray-600"}`}>
                  {stage.track}
                </span>
              )}
            </div>
          </div>
          <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold shrink-0 ${STATUS_STYLES[stage.status] ?? "bg-gray-100 text-gray-600"}`}>
            {delayed ? "Overdue" : stage.status.replace(/_/g, " ")}
          </span>
        </div>

        {(stage.actual_start_date || stage.actual_end_date) && (
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {stage.actual_start_date && (<span>Started {fmtDateShort(stage.actual_start_date)}</span>)}
            {stage.actual_end_date && (<span>Completed {fmtDateShort(stage.actual_end_date)}</span>)}
          </div>
        )}

        {canAction && (
          <div className="flex items-center gap-2 mt-3">
            {(isNotStarted || (delayed && !isInProgress)) && (
              <button onClick={onStart} disabled={completing}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium active:bg-blue-100 disabled:opacity-50 transition-colors min-h-[44px]"
                aria-label="Mark started">
                <Play size={14} /> Started
              </button>
            )}
            <button onClick={onComplete} disabled={completing}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium active:bg-green-100 disabled:opacity-50 transition-colors min-h-[44px]"
              aria-label="Mark complete">
              <Check size={14} /> Complete
            </button>
            <button onClick={onToggleEdit}
              className={`ml-auto w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                isEditing ? "bg-blue-100 border border-blue-300" : "bg-gray-50 border border-gray-200 active:bg-gray-100"
              }`} aria-label="Edit stage">
              {isEditing ? <X size={15} className="text-[#4272EF]" /> : <Pencil size={14} className="text-gray-400" />}
            </button>
          </div>
        )}

        {isComplete && (
          <div className="flex items-center mt-2">
            <button onClick={onToggleEdit}
              className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center active:bg-gray-100 transition-colors ml-auto">
              <Pencil size={14} className="text-gray-400" />
            </button>
          </div>
        )}
      </div>
      {isEditing && <MobileEditSheet stage={stage} projectId={projectId} onClose={onToggleEdit} />}
    </div>
  );
}

// -- Completed stages collapsible (mobile) --
function CompletedSection({
  stages, projectId, editingId, setEditingId, completingId, onComplete, onStart,
}: {
  stages: StageRow[]; projectId: string; editingId: string | null;
  setEditingId: (id: string | null) => void; completingId: string | null;
  onComplete: (stage: StageRow) => void; onStart: (stage: StageRow) => void;
}) {
  const [open, setOpen] = useState(false);
  if (stages.length === 0) return null;

  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-500 font-medium rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Completed ({stages.length})</span>
      </button>
      {open && (
        <div className="space-y-2 mt-2">
          {stages.map((stage) => (
            <MobileStageCard key={stage.id} stage={stage} projectId={projectId}
              isEditing={editingId === stage.id}
              onToggleEdit={() => setEditingId(editingId === stage.id ? null : stage.id)}
              onComplete={() => onComplete(stage)} onStart={() => onStart(stage)}
              completing={completingId === stage.id} />
          ))}
        </div>
      )}
    </div>
  );
}

// -- Main component --
export default function StageReportTab({ stages, projectId, isHome, startDate }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [showEditStages, setShowEditStages] = useState(false);
  const [, startCompleteTransition] = useTransition();

  function handleQuickComplete(stage: StageRow) {
    setCompletingId(stage.id);
    const today = new Date().toISOString().split("T")[0];
    startCompleteTransition(async () => {
      await updateStage(stage.id, {
        actual_start_date: stage.actual_start_date || today,
        actual_end_date: today,
        status: "complete",
        notes: stage.notes || null,
      }, projectId);
      setCompletingId(null);
      router.refresh();
    });
  }

  function handleStart(stage: StageRow) {
    setCompletingId(stage.id);
    const today = new Date().toISOString().split("T")[0];
    startCompleteTransition(async () => {
      await updateStage(stage.id, {
        actual_start_date: today,
        actual_end_date: null,
        status: "in_progress",
        notes: stage.notes || null,
      }, projectId);
      setCompletingId(null);
      router.refresh();
    });
  }

  if (stages.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-400 text-center py-8">No build stages created yet.</p>
        <div className="flex justify-center"><ResetScheduleButton projectId={projectId} /></div>
      </div>
    );
  }

  const activeStages = stages.filter((s) => s.status !== "skipped");
  const completeCount = activeStages.filter((s) => s.status === "complete" || s.status === "completed").length;
  const pct = activeStages.length > 0 ? Math.round((completeCount / activeStages.length) * 100) : 0;
  const outOfSpec = isHome && hasOutOfSpecDates(stages, startDate);

  const visibleStages = stages.filter((s) => s.status !== "skipped");
  const activeForMobile = visibleStages.filter((s) => s.status !== "complete" && s.status !== "completed");
  const completedForMobile = visibleStages.filter((s) => s.status === "complete" || s.status === "completed");
  const sortedActive = sortStagesForDisplay(activeForMobile);
  const sortedCompleted = [...completedForMobile].sort((a, b) => b.stage_number - a.stage_number);
  const desktopStages = sortStagesForDisplay(visibleStages);

  return (
    <div className="space-y-4">
      {outOfSpec && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Schedule dates out of sync</p>
            <p className="mt-0.5 text-amber-700 text-xs">Click <span className="font-semibold">Reset Schedule</span> to recalculate from the project start date.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-1 bg-gray-100 rounded-full h-2.5">
            <div className="bg-[#4272EF] h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-gray-500 shrink-0 tabular-nums">{completeCount}/{activeStages.length} ({pct}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEditStages(true)}
            className="hidden lg:flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors min-h-[36px]">
            <Settings2 size={13} /> Edit Stages
          </button>
          <ResetScheduleButton projectId={projectId} />
        </div>
      </div>

      {showEditStages && (
        <EditStagesModal stages={stages} projectId={projectId} onClose={() => setShowEditStages(false)} />
      )}

      {/* Mobile card list */}
      <div className="lg:hidden space-y-2">
        {sortedActive.map((stage) => (
          <MobileStageCard key={stage.id} stage={stage} projectId={projectId}
            isEditing={editingId === stage.id}
            onToggleEdit={() => setEditingId(editingId === stage.id ? null : stage.id)}
            onComplete={() => handleQuickComplete(stage)} onStart={() => handleStart(stage)}
            completing={completingId === stage.id} />
        ))}
        <CompletedSection stages={sortedCompleted} projectId={projectId}
          editingId={editingId} setEditingId={setEditingId} completingId={completingId}
          onComplete={handleQuickComplete} onStart={handleStart} />
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider w-8">#</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Stage</th>
              {isHome && <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Track</th>}
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Planned Start</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Planned End</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Actual Start</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Actual End</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Variance</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {desktopStages.map((stage) => {
              const stageDelayed = isDelayed(stage);
              const editing = editingId === stage.id;
              const isComp = stage.status === "complete" || stage.status === "completed";
              const stageNotStarted = stage.status === "not_started";
              return (
                <Fragment key={stage.id}>
                  <tr className={`hover:bg-gray-50 transition-colors ${
                    stageDelayed ? "bg-amber-50/60" : ""
                  } ${editing ? "bg-blue-50/40" : ""} ${isComp ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">{stage.stage_number}</td>
                    <td className="px-3 py-2.5 text-gray-900 font-medium">
                      {stage.stage_name}
                      {stage.notes && <p className="text-xs text-gray-400 font-normal mt-0.5 truncate max-w-[200px]">{stage.notes}</p>}
                    </td>
                    {isHome && (
                      <td className="px-3 py-2.5">
                        {stage.track ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TRACK_STYLES[stage.track] ?? "bg-gray-100 text-gray-600"}`}>{stage.track}</span>
                        ) : <span className="text-xs text-gray-400">&mdash;</span>}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[stage.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {stage.status.replace(/_/g, " ")}
                      </span>
                      {stageDelayed && <span className="ml-1.5 text-xs text-amber-600 font-medium">Delayed</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(stage.planned_start_date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(stage.planned_end_date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(stage.actual_start_date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">{fmtDate(stage.actual_end_date)}</td>
                    <td className={`px-3 py-2.5 text-xs ${varianceClass(stage)}`}>{varianceLabel(stage)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {!isComp && (
                          <>
                            {(stageNotStarted || stageDelayed) && (
                              <button onClick={() => handleStart(stage)} disabled={completingId === stage.id}
                                className="p-1.5 rounded transition-colors text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50" title="Mark started">
                                <Play size={14} />
                              </button>
                            )}
                            <button onClick={() => handleQuickComplete(stage)} disabled={completingId === stage.id}
                              className="p-1.5 rounded transition-colors text-gray-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-50" title="Mark complete">
                              <Check size={14} />
                            </button>
                          </>
                        )}
                        <button onClick={() => setEditingId(editing ? null : stage.id)}
                          className={`p-1.5 rounded transition-colors ${editing ? "text-[#4272EF] bg-blue-100" : "text-gray-400 hover:text-[#4272EF] hover:bg-blue-50"}`}
                          title={editing ? "Close edit" : "Edit stage"}>
                          {editing ? <X size={14} /> : <Pencil size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing && <DesktopEditForm stage={stage} projectId={projectId} onClose={() => setEditingId(null)} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
                  