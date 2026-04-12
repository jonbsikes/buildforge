"use client";

import React, { useState, useTransition } from "react";
import { Plus, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { CostCode, Phase, AvailableCostCode } from "@/components/projects/ProjectTabs";
import { Search } from "lucide-react";
import { updatePhaseLotsSold, addProjectCostCodes, removeProjectCostCode, getInvoicesForCostCode } from "@/app/actions/projects";
import type { CostCodeInvoice } from "@/app/actions/projects";
import Link from "next/link";

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
// Add Cost Code panel — multi-select with search
// ---------------------------------------------------------------------------
function AddCostCodePanel({
  projectId,
  available,
  onAdded,
}: {
  projectId: string;
  available: AvailableCostCode[];
  onAdded: (added: AvailableCostCode[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filtered = available.filter((cc) => {
    const q = search.toLowerCase();
    return !q || cc.name.toLowerCase().includes(q) || cc.code.includes(q);
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, AvailableCostCode[]>>((acc, cc) => {
    const key = cc.category ?? "other";
    (acc[key] = acc[key] ?? []).push(cc);
    return acc;
  }, {});

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((cc) => cc.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handleAdd() {
    if (!selected.size) return;
    setError(null);
    const toAdd = available.filter((cc) => selected.has(cc.id));
    startTransition(async () => {
      const result = await addProjectCostCodes(projectId, Array.from(selected));
      if (result.error) {
        setError(result.error);
      } else {
        onAdded(toAdd);
        setSelected(new Set());
        setSearch("");
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4272EF] border border-[#4272EF] rounded-lg hover:bg-blue-50 transition-colors"
      >
        <Plus size={13} />
        Add Cost Code
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { setOpen(false); setSelected(new Set()); setSearch(""); setError(null); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="text-base font-semibold text-gray-800">Add Cost Codes</span>
              <button onClick={() => { setOpen(false); setSelected(new Set()); setSearch(""); setError(null); }}
                className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <Search size={14} className="text-gray-400 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search cost codes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Select all / clear */}
            <div className="flex items-center justify-between px-5 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-500 font-medium">
                {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} available`}
              </span>
              <div className="flex gap-4">
                <button onClick={selectAll} className="text-xs text-[#4272EF] hover:underline font-medium">Select All</button>
                <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">Clear</button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 px-3 py-3">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No cost codes match your search.</p>
              ) : (
                Object.entries(grouped).map(([cat, codes]) => (
                  <div key={cat} className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-2 mb-1.5">
                      {cat.replace(/_/g, " ")}
                    </p>
                    {codes.map((cc) => (
                      <label key={cc.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={selected.has(cc.id)}
                          onChange={() => toggle(cc.id)}
                          className="accent-[#4272EF] w-4 h-4 shrink-0 cursor-pointer"
                        />
                        <span className="text-xs text-gray-400 w-7 shrink-0 font-mono">{cc.code}</span>
                        <span className="text-sm text-gray-700">{cc.name}</span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
              {error && <p className="text-xs text-red-500 flex-1">{error}</p>}
              <button
                onClick={() => { setOpen(false); setSelected(new Set()); setSearch(""); setError(null); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={isPending || selected.size === 0}
                className="flex-1 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-50"
              >
                {isPending ? "Adding…" : selected.size > 0 ? `Add ${selected.size} Cost Code${selected.size > 1 ? "s" : ""}` : "Add Cost Codes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Invoice status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "";
  const styles: Record<string, string> = {
    pending_review: "bg-yellow-50 text-yellow-700 border border-yellow-200",
    approved:       "bg-blue-50 text-blue-700 border border-blue-200",
    released:       "bg-purple-50 text-purple-700 border border-purple-200",
    cleared:        "bg-green-50 text-green-700 border border-green-200",
    disputed:       "bg-red-50 text-red-700 border border-red-200",
    void:           "bg-gray-50 text-gray-400 border border-gray-200",
  };
  const labels: Record<string, string> = {
    pending_review: "Pending Review",
    approved: "Approved",
    released: "Released",
    cleared: "Cleared",
    disputed: "Disputed",
    void: "Void",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[s] ?? "bg-gray-50 text-gray-500 border border-gray-200"}`}>
      {labels[s] ?? s}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Expanded invoice rows (rendered as a <tr> inside the parent table)
// ---------------------------------------------------------------------------
function InvoiceSubRow({
  invoices,
  loading,
  error,
  colSpan,
}: {
  invoices: CostCodeInvoice[];
  loading: boolean;
  error: string | null;
  colSpan: number;
}) {
  const fmtDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <div className="bg-blue-50/50 border-t border-b border-blue-100 px-6 py-3">
          {loading && (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              Loading invoices…
            </div>
          )}
          {error && !loading && (
            <p className="text-sm text-red-500 py-2">{error}</p>
          )}
          {!loading && !error && invoices.length === 0 && (
            <p className="text-sm text-gray-400 py-2">No invoices found for this cost code.</p>
          )}
          {!loading && !error && invoices.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wider">
                  <th className="text-left pb-2 font-medium">Invoice #</th>
                  <th className="text-left pb-2 font-medium">Vendor</th>
                  <th className="text-left pb-2 font-medium">Date</th>
                  <th className="text-left pb-2 font-medium">Status</th>
                  <th className="text-right pb-2 font-medium">Amount</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-blue-100/40 transition-colors">
                    <td className="py-2 font-mono text-gray-600 pr-4">
                      {inv.invoice_number ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 text-gray-700 pr-4">
                      {inv.vendor ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 text-gray-500 pr-4 whitespace-nowrap">
                      {fmtDate(inv.invoice_date)}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="py-2 text-right font-medium text-gray-800 pr-4">
                      {inv.amount != null ? fmt(inv.amount) : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-[#4272EF] hover:underline font-medium"
                        title="View invoice"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-blue-200">
                  <td colSpan={4} className="pt-2 text-gray-400 font-medium">
                    {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
                  </td>
                  <td className="pt-2 text-right font-semibold text-gray-700 pr-4">
                    {fmt(invoices.reduce((s, i) => s + (i.amount ?? 0), 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </td>
    </tr>
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
  projectId, isHome, costCodes, availableCostCodes, phases, actualByCostCodeId,
}: {
  projectId: string;
  isHome: boolean;
  costCodes: CostCode[];
  availableCostCodes: AvailableCostCode[];
  phases: Phase[];
  actualByCostCodeId: Record<string, number>;
}) {
  const [activeCodes, setActiveCodes] = useState(costCodes);
  const [available, setAvailable] = useState(availableCostCodes);

  // Drill-down state
  const [expandedCodeId, setExpandedCodeId] = useState<string | null>(null);
  const [invoiceCache, setInvoiceCache] = useState<Record<string, CostCodeInvoice[]>>({});
  const [loadingCodeId, setLoadingCodeId] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  async function handleRowClick(cc: CostCode) {
    const hasActual = (actualByCostCodeId[cc.id] ?? 0) > 0;
    if (!hasActual) return;

    // Toggle collapse
    if (expandedCodeId === cc.id) {
      setExpandedCodeId(null);
      return;
    }

    setExpandedCodeId(cc.id);
    setInvoiceError(null);

    // Serve from cache if already loaded
    if (invoiceCache[cc.id]) return;

    setLoadingCodeId(cc.id);
    const result = await getInvoicesForCostCode(projectId, cc.id);
    setLoadingCodeId(null);
    i