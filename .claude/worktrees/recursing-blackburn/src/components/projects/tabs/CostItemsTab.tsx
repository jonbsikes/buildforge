"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import type { CostCode, Phase, AvailableCostCode } from "@/components/projects/ProjectTabs";
import { updatePhaseLotsSold, addProjectCostCode, removeProjectCostCode } from "@/app/actions/projects";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function CATEGORY_LABEL(cat: string): string {
  const MAP: Record<string, string> = {
    land: "Land",
    siteworks: "Siteworks",
    foundation: "Foundation",
    framing: "Framing",
    roofing: "Roofing",
    electrical: "Electrical",
    plumbing: "Plumbing",
    hvac: "HVAC",
    insulation: "Insulation",
    drywall: "Drywall",
    flooring: "Flooring",
    cabinetry: "Cabinetry",
    painting: "Painting",
    landscaping: "Landscaping",
    permits: "Permits",
    professional_fees: "Professional Fees",
    contingency: "Contingency",
    other: "Other",
  };
  return MAP[cat] ?? cat;
}

// ---------------------------------------------------------------------------
// Phase row with inline lots_sold edit
// ---------------------------------------------------------------------------
function PhaseRow({ phase, projectId }: { phase: Phase; projectId: string }) {
  const [lotsSold, setLotsSold] = useState(phase.lots_sold ?? 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(lotsSold));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remaining = (phase.number_of_lots ?? 0) - lotsSold;

  function handleSave() {
    const val = parseInt(draft, 10);
    if (isNaN(val) || val < 0) {
      setError("Must be 0 or more");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updatePhaseLotsSold(phase.id, val, projectId);
      if (result.error) {
        setError(result.error);
      } else {
        setLotsSold(val);
        setEditing(false);
      }
    });
  }

  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-xs text-gray-400">Phase {phase.phase_number}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{phase.name}</td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {phase.size_acres != null ? `${phase.size_acres} ac` : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 text-right">
        {phase.number_of_lots ?? "—"}
      </td>
      <td className="px-4 py-3 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1.5">
            <input
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#4272EF] text-right"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
              autoFocus
            />
            <button onClick={handleSave} disabled={isPending} className="text-xs text-[#4272EF] font-medium hover:underline disabled:opacity-50">
              {isPending ? "…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
            {error && <span className="text-xs text-red-500">{error}</span>}
          </div>
        ) : (
          <button
            onClick={() => { setDraft(String(lotsSold)); setEditing(true); }}
            className="text-xs text-gray-700 font-medium hover:text-[#4272EF] transition-colors"
            title="Click to edit lots sold"
          >
            {lotsSold}
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-right font-medium text-gray-600">
        {remaining >= 0 ? remaining : 0}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          phase.status === "complete" ? "bg-green-100 text-green-700" :
          phase.status === "in_progress" ? "bg-blue-100 text-blue-700" :
          "bg-gray-100 text-gray-600"
        }`}>
          {phase.status.replace(/_/g, " ")}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Add Cost Code panel
// ---------------------------------------------------------------------------
function AddCostCodePanel({
  projectId,
  available,
  onAdded,
}: {
  projectId: string;
  available: AvailableCostCode[];
  onAdded: (cc: AvailableCostCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!selected) return;
    const cc = available.find((c) => c.code === selected);
    if (!cc) return;
    setError(null);
    startTransition(async () => {
      const result = await addProjectCostCode(projectId, cc.id);
      if (result.error) {
        setError(result.error);
      } else {
        onAdded(cc);
        setSelected("");
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4272EF] border border-[#4272EF] rounded-lg hover:bg-blue-50 transition-colors"
      >
        <Plus size={13} />
        Add Cost Code
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="flex-1 min-w-48 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] bg-white"
      >
        <option value="">— Select a cost code —</option>
        {available.map((cc) => (
          <option key={cc.code} value={cc.code}>
            {cc.code} — {cc.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleAdd}
        disabled={isPending || !selected}
        className="px-3 py-1.5 bg-[#4272EF] text-white rounded-lg text-xs font-medium hover:bg-[#3461de] transition-colors disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add"}
      </button>
      <button
        onClick={() => { setOpen(false); setSelected(""); setError(null); }}
        className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X size={14} />
      </button>
      {error && <p className="text-xs text-red-500 w-full">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remove cost code button (inline)
// ---------------------------------------------------------------------------
function RemoveCodeButton({
  pccId, projectId, onRemoved,
}: {
  pccId: string; projectId: string; onRemoved: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      await removeProjectCostCode(pccId, projectId);
      onRemoved();
    });
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      title="Remove from project"
      className="p-1 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40 rounded"
    >
      <X size={13} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function CostItemsTab({
  projectId, isHome, costCodes, availableCostCodes, phases,
}: {
  projectId: string;
  isHome: boolean;
  costCodes: CostCode[];
  availableCostCodes: AvailableCostCode[];
  phases: Phase[];
}) {
  const [activeCodes, setActiveCodes] = useState(costCodes);
  const [available, setAvailable] = useState(availableCostCodes);

  const totalBudget = activeCodes.reduce((s, c) => s + (c.budgeted_amount ?? 0), 0);

  function handleAdded(cc: AvailableCostCode) {
    // Optimistically move from available → active (budgeted_amount will be 0 until page refresh)
    setAvailable((prev) => prev.filter((c) => c.code !== cc.code));
    setActiveCodes((prev) => [
      ...prev,
      {
        id: cc.id,
        pccId: "",
        budgeted_amount: 0,
        code: cc.code,
        name: cc.name,
        category: cc.category,
        sort_order: cc.sort_order,
      },
    ].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)));
  }

  function handleRemoved(pccId: string) {
    const removed = activeCodes.find((c) => c.pccId === pccId);
    if (removed) {
      setAvailable((prev) =>
        [...prev, { id: removed.id, code: removed.code, name: removed.name, category: removed.category, sort_order: removed.sort_order }]
          .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
      );
    }
    setActiveCodes((prev) => prev.filter((c) => c.pccId !== pccId));
  }

  return (
    <div className="space-y-6">
      {/* Phases section (land dev only) */}
      {!isHome && phases.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Project Phases</h3>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Phase Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Acreage</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Total Lots</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Sold</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Remaining</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((phase) => (
                  <PhaseRow key={phase.id} phase={phase} projectId={projectId} />
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Click a "Sold" number to update lots sold for that phase.</p>
        </div>
      )}

      {/* Cost codes */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Cost Items — {isHome ? "Home Construction" : "Land Development"}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Total budget: <span className="font-semibold text-gray-700">{fmt(totalBudget)}</span>
            </p>
          </div>
          {available.length > 0 && (
            <AddCostCodePanel
              projectId={projectId}
              available={available}
              onAdded={handleAdded}
            />
          )}
        </div>

        {activeCodes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            No cost codes are enabled for this project. Use "Add Cost Code" to add one.
          </p>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Code</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Category</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Budget</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeCodes.map((cc) => (
                  <tr key={cc.pccId || cc.code} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{cc.code}</td>
                    <td className="px-4 py-2.5 text-gray-900">{cc.name}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{CATEGORY_LABEL(cc.category)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-800 font-medium">
                      {cc.budgeted_amount > 0 ? fmt(cc.budgeted_amount) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                      {cc.pccId && (
                        <RemoveCodeButton
                          pccId={cc.pccId}
                          projectId={projectId}
                          onRemoved={() => handleRemoved(cc.pccId)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-gray-600">Total</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmt(totalBudget)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
