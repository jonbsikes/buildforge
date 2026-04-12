// @ts-nocheck
"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import type { Phase } from "@/components/projects/ProjectTabs";
import { createPhase, updatePhase, deletePhase } from "@/app/actions/projects";

const STATUSES = ["planning", "in_progress", "complete", "on_hold"] as const;

const STATUS_COLORS: Record<string, string> = {
  complete:    "bg-green-100 text-green-700",
  in_progress: "bg-blue-100 text-blue-700",
  on_hold:     "bg-amber-100 text-amber-700",
  planning:    "bg-gray-100 text-gray-600",
};

interface PhaseForm {
  phase_number: string;
  name: string;
  size_acres: string;
  number_of_lots: string;
  lots_sold: string;
  status: string;
  notes: string;
}

const EMPTY_FORM: PhaseForm = {
  phase_number: "",
  name: "",
  size_acres: "",
  number_of_lots: "",
  lots_sold: "0",
  status: "planning",
  notes: "",
};

function parseForm(f: PhaseForm) {
  return {
    phase_number: f.phase_number ? parseInt(f.phase_number, 10) : undefined,
    name: f.name.trim(),
    size_acres: f.size_acres ? parseFloat(f.size_acres) : null,
    number_of_lots: f.number_of_lots ? parseInt(f.number_of_lots, 10) : null,
    lots_sold: f.lots_sold ? parseInt(f.lots_sold, 10) : 0,
    status: f.status,
    notes: f.notes.trim() || null,
  };
}

function ic(err = false) {
  return `w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#4272EF] bg-white ${err ? "border-red-400" : "border-gray-300"}`;
}

// ---------------------------------------------------------------------------
// Inline edit row
// ---------------------------------------------------------------------------
function EditRow({
  phase, projectId, onSaved, onCancel,
}: {
  phase: Phase; projectId: string; onSaved: (updated: Phase) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<PhaseForm>({
    phase_number: phase.phase_number != null ? String(phase.phase_number) : "",
    name: phase.name ?? "",
    size_acres: phase.size_acres != null ? String(phase.size_acres) : "",
    number_of_lots: phase.number_of_lots != null ? String(phase.number_of_lots) : "",
    lots_sold: phase.lots_sold != null ? String(phase.lots_sold) : "0",
    status: phase.status ?? "planning",
    notes: phase.notes ?? "",
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const s = (k: keyof PhaseForm, v: string) => setF((p) => ({ ...p, [k]: v }));

  function save() {
    if (!f.name.trim()) { setError("Phase name is required"); return; }
    setError(null);
    const data = parseForm(f);
    startTransition(async () => {
      const result = await updatePhase(phase.id, projectId, data);
      if (result.error) { setError(result.error); return; }
      onSaved({ ...phase, ...data, name: data.name });
    });
  }

  return (
    <tr className="bg-blue-50 border-b border-blue-100">
      <td className="px-3 py-2">
        <input type="number" min={1} value={f.phase_number} onChange={(e) => s("phase_number", e.target.value)} className={ic()} placeholder="#" />
      </td>
      <td className="px-3 py-2">
        <input type="text" value={f.name} onChange={(e) => s("name", e.target.value)} className={ic(!f.name.trim() && !!error)} placeholder="Phase name" autoFocus />
      </td>
      <td className="px-3 py-2">
        <input type="number" step="0.001" min={0} value={f.size_acres} onChange={(e) => s("size_acres", e.target.value)} className={ic()} placeholder="0.0" />
      </td>
      <td className="px-3 py-2">
        <input type="number" min={0} value={f.number_of_lots} onChange={(e) => s("number_of_lots", e.target.value)} className={ic()} placeholder="0" />
      </td>
      <td className="px-3 py-2">
        <input type="number" min={0} value={f.lots_sold} onChange={(e) => s("lots_sold", e.target.value)} className={ic()} placeholder="0" />
      </td>
      <td className="px-3 py-2">
        <select value={f.status} onChange={(e) => s("status", e.target.value)} className={ic()}>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {error && <span className="text-xs text-red-500 mr-1">{error}</span>}
          <button onClick={save} disabled={isPending} className="p-1.5 bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] disabled:opacity-50">
            <Check size={13} />
          </button>
          <button onClick={onCancel} className="p-1.5 border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Delete button
// ---------------------------------------------------------------------------
function DeletePhaseButton({ phaseId, projectId, onDeleted }: { phaseId: string; projectId: string; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="p-1 text-gray-300 hover:text-red-400 rounded transition-colors" title="Delete phase">
        <Trash2 size={13} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-red-600">Delete?</span>
      <button
        onClick={() => startTransition(async () => { await deletePhase(phaseId, projectId); onDeleted(); })}
        disabled={isPending}
        className="text-xs text-red-600 font-medium hover:underline disabled:opacity-50"
      >
        Yes
      </button>
      <button onClick={() => setConfirm(false)} className="text-xs text-gray-400 hover:text-gray-600">No</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add phase row
// ---------------------------------------------------------------------------
function AddPhaseRow({ projectId, onAdded, onCancel }: { projectId: string; onAdded: (p: Phase) => void; onCancel: () => void }) {
  const [f, setF] = useState<PhaseForm>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const s = (k: keyof PhaseForm, v: string) => setF((p) => ({ ...p, [k]: v }));

  function save() {
    if (!f.name.trim()) { setError("Phase name is required"); return; }
    setError(null);
    const data = parseForm(f);
    startTransition(async () => {
      const result = await createPhase(projectId, data);
      if (result.error) { setError(result.error); return; }
      onAdded({
        id: crypto.randomUUID(),
        phase_number: data.phase_number ?? null,
        name: data.name,
        size_acres: data.size_acres ?? null,
        number_of_lots: data.number_of_lots ?? null,
        lots_sold: data.lots_sold ?? 0,
        status: data.status,
        notes: data.notes ?? null,
      });
      setF(EMPTY_FORM);
    });
  }

  return (
    <tr className="bg-green-50 border-b border-green-100">
      <td className="px-3 py-2">
        <input type="number" min={1} value={f.phase_number} onChange={(e) => s("phase_number", e.target.value)} className={ic()} placeholder="#" />
      </td>
      <td className="px-3 py-2">
        <input type="text" value={f.name} onChange={(e) => s("name", e.target.value)} className={ic(!f.name.trim() && !!error)} placeholder="Phase name *" autoFocus />
      </td>
      <td className="px-3 py-2">
        <input type="number" step="0.001" min={0} value={f.size_acres} onChange={(e) => s("size_acres", e.target.value)} className={ic()} placeholder="0.0" />
      </td>
      <td className="px-3 py-2">
        <input type="number" min={0} value={f.number_of_lots} onChange={(e) => s("number_of_lots", e.target.value)} className={ic()} placeholder="0" />
      </td>
      <td className="px-3 py-2">
        <input type="number" min={0} value={f.lots_sold} onChange={(e) => s("lots_sold", e.target.value)} className={ic()} placeholder="0" />
      </td>
      <td className="px-3 py-2">
        <select value={f.status} onChange={(e) => s("status", e.target.value)} className={ic()}>
          {STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {error && <span className="text-xs text-red-500 mr-1">{error}</span>}
          <button onClick={save} disabled={isPending} className="p-1.5 bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] disabled:opacity-50">
            {isPending ? "…" : <Check size={13} />}
          </button>
          <button onClick={onCancel} className="p-1.5 border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function PhasesTab({ projectId, initialPhases }: { projectId: string; initialPhases: Phase[] }) {
  const [phases, setPhases] = useState<Phase[]>(initialPhases);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const totalLots = phases.reduce((s, p) => s + (p.number_of_lots ?? 0), 0);
  const totalSold = phases.reduce((s, p) => s + (p.lots_sold ?? 0), 0);
  const totalRemaining = totalLots - totalSold;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      {phases.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-0.5">Total Lots</p>
            <p className="text-xl font-semibold text-gray-900">{totalLots}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-0.5">Sold</p>
            <p className="text-xl font-semibold text-green-700">{totalSold}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-gray-400 mb-0.5">Remaining</p>
            <p className="text-xl font-semibold text-[#4272EF]">{Math.max(0, totalRemaining)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Phases</h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4272EF] border border-[#4272EF] rounded-lg hover:bg-blue-50 transition-colors"
          >
            <Plus size={13} />
            Add Phase
          </button>
        )}
      </div>

      {phases.length === 0 && !adding ? (
        <div className="text-center py-10 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No phases yet. Click "Add Phase" to create the first one.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider w-16">#</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider w-24">Acres</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider w-24">Total Lots</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider w-20">Sold</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider w-28">Status</th>
                <th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {phases.map((phase) =>
                editingId === phase.id ? (
                  <EditRow
                    key={phase.id}
                    phase={phase}
                    projectId={projectId}
                    onSaved={(updated) => {
                      setPhases((prev) => prev.map((p) => p.id === updated.id ? updated : p));
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <tr key={phase.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors group">
                    <td className="px-3 py-3 text-xs text-gray-400">{phase.phase_number ?? "—"}</td>
                    <td className="px-3 py-3 font-medium text-gray-900">{phase.name}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{phase.size_acres != null ? `${phase.size_acres} ac` : "—"}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{phase.number_of_lots ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-gray-600">{phase.lots_sold ?? 0}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[phase.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {phase.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingId(phase.id)}
                          className="p-1 text-gray-400 hover:text-[#4272EF] rounded transition-colors"
                          title="Edit phase"
                        >
                          <Pencil size={13} />
                        </button>
                        <DeletePhaseButton
                          phaseId={phase.id}
                          projectId={projectId}
                          onDeleted={() => setPhases((prev) => prev.filter((p) => p.id !== phase.id))}
                        />
                      </div>
                    </td>
                  </tr>
                )
              )}
              {adding && (
                <AddPhaseRow
                  projectId={projectId}
                  onAdded={(p) => {
                    setPhases((prev) => [...prev, p].sort((a, b) => (a.phase_number ?? 999) - (b.phase_number ?? 999)));
                    setAdding(false);
                  }}
                  onCancel={() => setAdding(false)}
                />
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
