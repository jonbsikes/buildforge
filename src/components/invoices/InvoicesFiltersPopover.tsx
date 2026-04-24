"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export type InvoiceFilters = {
  statuses: string[];
  projects: string[];
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
};

export const EMPTY_FILTERS: InvoiceFilters = {
  statuses: [],
  projects: [],
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
};

export function countActiveFilters(f: InvoiceFilters): number {
  let n = 0;
  n += f.statuses.length;
  n += f.projects.length;
  if (f.dateFrom || f.dateTo) n += 1;
  if (f.amountMin || f.amountMax) n += 1;
  return n;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pending_review", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "released", label: "Released" },
  { value: "cleared", label: "Cleared" },
  { value: "disputed", label: "Disputed" },
  { value: "void", label: "Void" },
];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function datePreset(kind: "week" | "month" | "last30"): { from: string; to: string } {
  const today = new Date();
  const to = toISODate(today);
  if (kind === "week") {
    // Monday of this week
    const d = new Date(today);
    const diff = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diff);
    return { from: toISODate(d), to };
  }
  if (kind === "month") {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toISODate(d), to };
  }
  // last 30
  const d = new Date(today);
  d.setDate(d.getDate() - 30);
  return { from: toISODate(d), to };
}

interface Props {
  value: InvoiceFilters;
  onChange: (next: InvoiceFilters) => void;
  projectOptions: string[];
}

export default function InvoicesFiltersPopover({ value, onChange, projectOptions }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<InvoiceFilters>(value);
  const rootRef = useRef<HTMLDivElement>(null);

  // Reset draft whenever we open so the popover mirrors applied state.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount = countActiveFilters(value);

  function toggleStatus(s: string) {
    setDraft((d) => ({
      ...d,
      statuses: d.statuses.includes(s) ? d.statuses.filter((x) => x !== s) : [...d.statuses, s],
    }));
  }

  function toggleProject(p: string) {
    setDraft((d) => ({
      ...d,
      projects: d.projects.includes(p) ? d.projects.filter((x) => x !== p) : [...d.projects, p],
    }));
  }

  function applyPreset(kind: "week" | "month" | "last30") {
    const { from, to } = datePreset(kind);
    setDraft((d) => ({ ...d, dateFrom: from, dateTo: to }));
  }

  function clearAll() {
    setDraft(EMPTY_FILTERS);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
          activeCount > 0
            ? "border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] bg-[color:var(--tint-active)]"
            : "border-gray-300 text-gray-600 hover:bg-gray-50"
        }`}
        aria-expanded={open}
      >
        Filters
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-[color:var(--brand-blue)] text-white">
            {activeCount}
          </span>
        )}
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-[340px] bg-white rounded-xl shadow-xl border border-gray-200 p-4 text-sm">
          {/* Status */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STATUS_OPTIONS.map((s) => {
                const checked = draft.statuses.includes(s.value);
                return (
                  <label
                    key={s.value}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStatus(s.value)}
                      className="rounded border-gray-300 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
                    />
                    <span className="text-gray-700">{s.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Project */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Project</p>
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-1">
              {projectOptions.length === 0 ? (
                <p className="px-2 py-1 text-xs text-gray-400">No projects</p>
              ) : (
                projectOptions.map((p) => {
                  const checked = draft.projects.includes(p);
                  return (
                    <label
                      key={p}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProject(p)}
                        className="rounded border-gray-300 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
                      />
                      <span className="text-gray-700 truncate">{p}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Date range */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Due Date</p>
            <div className="flex items-center gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => applyPreset("week")}
                className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                This week
              </button>
              <button
                type="button"
                onClick={() => applyPreset("month")}
                className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                This month
              </button>
              <button
                type="button"
                onClick={() => applyPreset("last30")}
                className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Last 30
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={draft.dateFrom}
                onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={draft.dateTo}
                onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
              />
            </div>
          </div>

          {/* Amount range */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Amount</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                placeholder="Min"
                value={draft.amountMin}
                onChange={(e) => setDraft((d) => ({ ...d, amountMin: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="Max"
                value={draft.amountMax}
                onChange={(e) => setDraft((d) => ({ ...d, amountMax: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <X size={12} />
              Clear all
            </button>
            <button
              type="button"
              onClick={apply}
              className="px-4 py-1.5 bg-[color:var(--brand-blue)] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
