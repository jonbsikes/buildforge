"use client";

import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Mail, Trash2, Search, ChevronUp, ChevronDown as ChevDown, Check, MoreVertical, Zap, CreditCard, FileText, Landmark } from "lucide-react";
import {
  deleteInvoice,
  setInvoiceStatus,
  voidInvoice,
  setPendingDraw,
  approveInvoice,
  payInvoiceAutoDraft,
} from "@/app/actions/invoices";
import {
  approveInvoicesBatch,
  setPendingDrawBatch,
} from "@/app/actions/invoice-batch";
import ConfirmButton from "@/components/ui/ConfirmButton";
import {
  EMPTY_FILTERS,
  type InvoiceFilters,
} from "@/components/invoices/InvoicesFiltersPopover";

// Status sort order: unpaid first (pending -> approved -> released -> disputed), then cleared/void last
const STATUS_SORT_ORDER: Record<string, number> = {
  pending_review: 0,
  approved: 1,
  released: 2,
  disputed: 3,
  cleared: 4,
  void: 5,
};

function fmt(n: number | null) {
  if (n == null) return " - ";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return " - ";
  const [y, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}/${y}`;
}

type SortField = "status" | "due_date" | "vendor" | "amount" | "invoice_date";
type SortDir = "asc" | "desc";

const STATUS_CHIP_LABEL: Record<string, string> = {
  pending_review: "Pending",
  approved: "Approved",
  released: "Released",
  cleared: "Cleared",
  disputed: "Disputed",
  void: "Void",
};

const STATUS_DOT_COLOR: Record<string, string> = {
  pending_review: "var(--status-warning)",
  approved: "var(--status-active)",
  released: "var(--status-active)",
  cleared: "var(--status-complete)",
  disputed: "var(--status-over)",
  void: "var(--status-planned)",
};

// Once a check is cut (released) the AP obligation is no longer "past due" —
// the vendor has been paid from AP's perspective. cleared/void are also done.
const PAID_STATUSES = new Set(["released", "cleared", "void"]);


type InvoiceRow = {
  id: string;
  vendor: string | null;
  vendor_id?: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number | null;
  status: string;
  ai_confidence: string;
  pending_draw: boolean | null;
  manually_reviewed: boolean | null;
  source: string | null;
  discount_taken: number | null;
  direct_cash_payment?: boolean | null;
  projects: { id: string; name: string } | null;
  cost_codes: { code: string; name: string } | null;
  vendors?: { auto_draft: boolean | null } | null;
  in_draw?: {
    id: string;
    draw_number: number | null;
    draw_date: string | null;
    status: string | null;
  } | null;
};

export default function InvoicesTable({
  rows,
  needsAttentionIds = [],
}: {
  rows: InvoiceRow[];
  needsAttentionIds?: string[];
}) {
  const router = useRouter();
  // Set lookup of pending-review invoices that are missing vendor, cost code,
  // amount, or were flagged low-confidence by the AI extractor. These rows
  // cannot be approved without manual review (the dropdowns on the edit
  // form must be filled in first).
  const needsAttention = useMemo(() => new Set(needsAttentionIds), [needsAttentionIds]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [drawOverrides, setDrawOverrides] = useState<Record<string, boolean>>({});
  const [payMenuFor, setPayMenuFor] = useState<string | null>(null);
  const [moreMenuFor, setMoreMenuFor] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setPayMenuFor(null);
        setMoreMenuFor(null);
      }
    }
    if (payMenuFor || moreMenuFor) {
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }
  }, [payMenuFor, moreMenuFor]);

  // Inline single-row approve used by both the row button and the `a` shortcut.
  function approveRow(invId: string) {
    const row = rows.find((r) => r.id === invId);
    if (!row) return;
    const effectiveStatus = statusOverrides[invId] ?? row.status;
    const blocked =
      effectiveStatus === "pending_review" &&
      needsAttention.has(invId) &&
      !row.manually_reviewed;
    if (blocked) {
      setBanner({ type: "error", msg: "Needs attention — fix vendor, cost code, and amount before approving" });
      return;
    }
    setStatusOverrides((prev) => ({ ...prev, [invId]: "approved" }));
    startTransition(async () => {
      const r = await approveInvoice(invId);
      if (r.error) {
        setStatusOverrides((prev) => {
          const n = { ...prev };
          delete n[invId];
          return n;
        });
        setBanner({ type: "error", msg: r.error });
      }
    });
  }

  useEffect(() => {
    if (banner) {
      const t = setTimeout(() => setBanner(null), 4000);
      return () => clearTimeout(t);
    }
  }, [banner]);

  // Search & filter state
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<InvoiceFilters>(EMPTY_FILTERS);
  const [pastDueOnly, setPastDueOnly] = useState(false);

  // Keyboard shortcuts (j/k move, x select, a approve, o open, / focus search)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable;

      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const len = sortedRowsRef.current.length;
      if (len === 0) return;
      const cur = focusedIndexRef.current ?? 0;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(Math.min(cur + 1, len - 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(Math.max(cur - 1, 0));
        return;
      }

      const row = sortedRowsRef.current[cur];
      if (!row) return;

      if (e.key === "x") {
        e.preventDefault();
        if (!selectMode) setSelectMode(true);
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(row.id)) next.delete(row.id);
          else next.add(row.id);
          return next;
        });
        return;
      }
      if (e.key === "o" || e.key === "Enter") {
        e.preventDefault();
        router.push(`/invoices/${row.id}`);
        return;
      }
      if (e.key === "a") {
        const st = statusOverridesRef.current[row.id] ?? row.status;
        if (st === "pending_review") {
          e.preventDefault();
          approveRow(row.id);
        }
        return;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode]);

  // Keep refs in sync so the keyboard handler above reads current state.
  const focusedIndexRef = useRef<number | null>(focusedIndex);
  const sortedRowsRef = useRef<InvoiceRow[]>([]);
  const statusOverridesRef = useRef<Record<string, string>>({});
  useEffect(() => { focusedIndexRef.current = focusedIndex; }, [focusedIndex]);
  useEffect(() => { statusOverridesRef.current = statusOverrides; }, [statusOverrides]);

  // Sort state  -  default: status asc, then due_date asc
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Derive unique projects for filter
  const uniqueProjects = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      const name = r.projects?.name ?? "G&A";
      if (!seen.has(name)) { seen.add(name); out.push(name); }
    }
    return out.sort();
  }, [rows]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    const amountMinNum = filters.amountMin ? parseFloat(filters.amountMin) : null;
    const amountMaxNum = filters.amountMax ? parseFloat(filters.amountMax) : null;
    const today = new Date().toISOString().split("T")[0]!;
    const filtered = rows.filter((r) => {
      const effectiveStatus = statusOverrides[r.id] ?? r.status;
      if (filters.statuses.length > 0 && !filters.statuses.includes(effectiveStatus)) return false;
      if (pastDueOnly) {
        if (PAID_STATUSES.has(effectiveStatus) || !r.due_date || r.due_date >= today) return false;
      }
      if (filters.projects.length > 0) {
        const proj = r.projects?.name ?? "G&A";
        if (!filters.projects.includes(proj)) return false;
      }
      if (filters.dateFrom && (r.due_date ?? "") < filters.dateFrom) return false;
      if (filters.dateTo && (r.due_date ?? "9999-99-99") > filters.dateTo) return false;
      if (amountMinNum != null && (r.amount ?? 0) < amountMinNum) return false;
      if (amountMaxNum != null && (r.amount ?? 0) > amountMaxNum) return false;
      if (search) {
        const q = search.toLowerCase();
        const vendorMatch = r.vendor?.toLowerCase().includes(q) ?? false;
        const invNumMatch = r.invoice_number?.toLowerCase().includes(q) ?? false;
        const projMatch = r.projects?.name?.toLowerCase().includes(q) ?? false;
        if (!vendorMatch && !invNumMatch && !projMatch) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const aStatus = statusOverrides[a.id] ?? a.status;
      const bStatus = statusOverrides[b.id] ?? b.status;

      // Primary: status order (unpaid first)
      if (sortField === "status") {
        const sA = STATUS_SORT_ORDER[aStatus] ?? 99;
        const sB = STATUS_SORT_ORDER[bStatus] ?? 99;
        if (sA !== sB) return sortDir === "asc" ? sA - sB : sB - sA;
        // Secondary: due date
        const dA = a.due_date ?? "9999-99-99";
        const dB = b.due_date ?? "9999-99-99";
        if (dA !== dB) return dA < dB ? -1 : 1;
        // Tertiary: vendor
        return (a.vendor ?? "").localeCompare(b.vendor ?? "");
      }

      let cmp = 0;
      if (sortField === "due_date") {
        const dA = a.due_date ?? "9999-99-99";
        const dB = b.due_date ?? "9999-99-99";
        cmp = dA < dB ? -1 : dA > dB ? 1 : 0;
      } else if (sortField === "vendor") {
        cmp = (a.vendor ?? "").localeCompare(b.vendor ?? "");
      } else if (sortField === "amount") {
        cmp = (a.amount ?? 0) - (b.amount ?? 0);
      } else if (sortField === "invoice_date") {
        const dA = a.invoice_date ?? "9999-99-99";
        const dB = b.invoice_date ?? "9999-99-99";
        cmp = dA < dB ? -1 : dA > dB ? 1 : 0;
      }

      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [rows, search, filters, pastDueOnly, sortField, sortDir, statusOverrides]);

  useEffect(() => { sortedRowsRef.current = sortedRows; }, [sortedRows]);

  const allSelected = sortedRows.length > 0 && sortedRows.every((r) => selected.has(r.id));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(sortedRows.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleDeleteSelected() {
    const ids = [...selected];
    await Promise.all(ids.map((id) => deleteInvoice(id)));
    exitSelectMode();
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="ml-1 text-gray-300">↕</span>;
    return sortDir === "asc"
      ? <ChevronUp size={12} className="inline ml-1" style={{ color: "var(--brand-blue)" }} />
      : <ChevDown size={12} className="inline ml-1" style={{ color: "var(--brand-blue)" }} />;
  }

  // Compute summary metrics
  const summaryMetrics = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    let pendingCount = 0;
    let pendingAmount = 0;
    let approvedCount = 0;
    let approvedAmount = 0;
    let pastDueCount = 0;
    let pastDueAmount = 0;

    for (const inv of sortedRows) {
      const effectiveStatus = statusOverrides[inv.id] ?? inv.status;
      const isPaid = PAID_STATUSES.has(effectiveStatus);
      const isPastDue = inv.due_date && !isPaid && inv.due_date < today;

      if (effectiveStatus === "pending_review") {
        pendingCount++;
        pendingAmount += inv.amount ?? 0;
      }
      if (effectiveStatus === "approved") {
        approvedCount++;
        approvedAmount += inv.amount ?? 0;
      }
      if (isPastDue) {
        pastDueCount++;
        pastDueAmount += inv.amount ?? 0;
      }
    }

    return { pendingCount, pendingAmount, approvedCount, approvedAmount, pastDueCount, pastDueAmount };
  }, [sortedRows, statusOverrides]);

  function handleApproveSelected() {
    const ids = [...selected];
    startTransition(async () => {
      const r = await approveInvoicesBatch(ids);
      if (r.error) setBanner({ type: "error", msg: r.error });
      else {
        const msg = r.skipped > 0
          ? `Approved ${r.approved}, skipped ${r.skipped}`
          : `Approved ${r.approved} invoice${r.approved !== 1 ? "s" : ""}`;
        setBanner({ type: r.skipped > 0 ? "error" : "success", msg });
      }
      exitSelectMode();
    });
  }

  function handleAddSelectedToDraw(pending: boolean) {
    const ids = [...selected];
    startTransition(async () => {
      const r = await setPendingDrawBatch(ids, pending);
      if (r.error) setBanner({ type: "error", msg: r.error });
      else setBanner({ type: "success", msg: `${pending ? "Added" : "Removed"} ${r.updated} invoice${r.updated !== 1 ? "s" : ""} ${pending ? "to" : "from"} draw` });
      exitSelectMode();
    });
  }

  return (
    <>
      {banner && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-slide-in-right ${
            banner.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* Inline summary strip (no card chrome) */}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 pb-3 mb-4 border-b border-gray-200 tabular-nums">
        <div>
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-2">Pending</span>
          <span className="text-sm font-bold text-gray-900">{summaryMetrics.pendingCount}</span>
          <span className="text-gray-300 mx-1.5">·</span>
          <span className="text-sm font-bold text-gray-900">{fmt(summaryMetrics.pendingAmount)}</span>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-2">Approved</span>
          <span className="text-sm font-bold text-gray-900">{summaryMetrics.approvedCount}</span>
          <span className="text-gray-300 mx-1.5">·</span>
          <span className="text-sm font-bold text-gray-900">{fmt(summaryMetrics.approvedAmount)}</span>
        </div>
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider mr-2" style={{ color: "var(--status-over)" }}>Past due</span>
          <span className="text-sm font-bold" style={{ color: "var(--status-over)" }}>{summaryMetrics.pastDueCount}</span>
          <span className="mx-1.5" style={{ color: "var(--status-over)", opacity: 0.4 }}>·</span>
          <span className="text-sm font-bold" style={{ color: "var(--status-over)" }}>{fmt(summaryMetrics.pastDueAmount)}</span>
        </div>
      </div>

      {/* Segmented status + search + project + select */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* Segmented status control */}
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-100">
          {([
            { key: "", label: "All", count: rows.length },
            { key: "pending_review", label: "Pending", count: rows.filter((r) => (statusOverrides[r.id] ?? r.status) === "pending_review").length },
            { key: "approved", label: "Approved", count: rows.filter((r) => (statusOverrides[r.id] ?? r.status) === "approved").length },
            { key: "past_due", label: "Past due", count: (() => {
              const t = new Date().toISOString().split("T")[0]!;
              return rows.filter((r) => {
                const s = statusOverrides[r.id] ?? r.status;
                return s !== "cleared" && s !== "void" && r.due_date && r.due_date < t;
              }).length;
            })() },
          ] as const).map((seg) => {
            const active =
              seg.key === ""
                ? filters.statuses.length === 0 && !pastDueOnly
                : seg.key === "past_due"
                ? pastDueOnly
                : filters.statuses.length === 1 && filters.statuses[0] === seg.key;
            return (
              <button
                key={seg.key || "all"}
                onClick={() => {
                  if (seg.key === "") {
                    setFilters((f) => ({ ...f, statuses: [] }));
                    setPastDueOnly(false);
                  } else if (seg.key === "past_due") {
                    setPastDueOnly(true);
                    setFilters((f) => ({ ...f, statuses: [] }));
                  } else {
                    setFilters((f) => ({ ...f, statuses: [seg.key as string] }));
                    setPastDueOnly(false);
                  }
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {seg.label} <span className="text-gray-400 font-normal ml-0.5">· {seg.count}</span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor, invoice #, or project… (press / to focus)"
            className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
          />
        </div>

        <select
          value={filters.projects[0] ?? ""}
          onChange={(e) =>
            setFilters((f) => ({ ...f, projects: e.target.value ? [e.target.value] : [] }))
          }
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
        >
          <option value="">All projects</option>
          {uniqueProjects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <button
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            selectMode
              ? "border-[color:var(--brand-blue)] text-[color:var(--brand-blue)] bg-[color:var(--tint-active)]"
              : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {selectMode ? "Cancel" : "Select"}
        </button>
      </div>

      <div className="text-xs text-gray-400 mb-3">
        {sortedRows.length} of {rows.length} invoice{rows.length !== 1 ? "s" : ""}
      </div>

      {/* Mobile: card stack */}
      <div className="md:hidden space-y-2">
        {sortedRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
            No invoices match these filters.
          </div>
        ) : (
          sortedRows.map((inv) => {
            const effectiveStatus = statusOverrides[inv.id] ?? inv.status;
            const isNeedsAttention =
              effectiveStatus === "pending_review" && needsAttention.has(inv.id);
            const isPaid = PAID_STATUSES.has(effectiveStatus);
            const todayStr = new Date().toISOString().split("T")[0]!;
            const isPastDue = !!inv.due_date && !isPaid && inv.due_date < todayStr;
            const pastDueDays = isPastDue && inv.due_date
              ? Math.floor((new Date(todayStr).getTime() - new Date(inv.due_date).getTime()) / 86400000)
              : 0;
            return (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-3.5 active:bg-gray-50"
                style={isPastDue ? { borderLeft: "3px solid var(--status-over)" } : undefined}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex flex-col items-center gap-1 mt-1.5 flex-shrink-0">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: STATUS_DOT_COLOR[effectiveStatus] ?? "var(--status-neutral)" }}
                    />
                    {inv.in_draw && (
                      <Landmark
                        size={12}
                        className="text-[color:var(--brand-blue)]"
                        aria-label="In draw request"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {inv.vendor ?? "—"}
                      <span className="ml-1.5 text-[11px] font-normal text-gray-400">{inv.invoice_number ?? ""}</span>
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                      {inv.projects?.name ?? "G&A"}
                      {inv.cost_codes && <span className="text-gray-400"> · {inv.cost_codes.name}</span>}
                    </p>
                    {(isPastDue || isNeedsAttention) && (
                      <p className="text-[10px] mt-1 flex items-center gap-1.5">
                        {isPastDue && (
                          <span className="font-medium" style={{ color: "var(--status-over)" }}>
                            Past due · {pastDueDays}d
                          </span>
                        )}
                        {isNeedsAttention && (
                          <span className="inline-flex items-center gap-0.5 font-bold uppercase tracking-wide" style={{ color: "var(--status-over)" }}>
                            <AlertTriangle size={10} /> Needs attention
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(inv.amount)}</div>
                    <div
                      className="text-[11px] tabular-nums"
                      style={{ color: isPastDue ? "var(--status-over)" : "#94a3b8" }}
                    >
                      {fmtDate(inv.due_date)}
                    </div>
                  </div>
                </div>
                {effectiveStatus === "pending_review" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      approveRow(inv.id);
                    }}
                    disabled={isPending || (isNeedsAttention && !inv.manually_reviewed)}
                    className="mt-3 w-full py-2 rounded-md text-xs font-semibold text-white disabled:opacity-40 inline-flex items-center justify-center gap-1.5 min-h-[44px]"
                    style={{ backgroundColor: "var(--brand-blue)" }}
                  >
                    <Check size={14} />
                    Approve
                  </button>
                )}
              </Link>
            );
          })
        )}
      </div>

      {/* Desktop / tablet: full table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white border-b border-gray-100">
              <tr>
                {selectMode && (
                  <th className="px-4 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="rounded border-gray-300 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
                    />
                  </th>
                )}
                {/* Status dot column: narrow, no header label */}
                <th className="w-6 px-2 py-2" />
                <th
                  className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none"
                  onClick={() => handleSort("vendor")}
                >
                  Vendor · Inv <SortIcon field="vendor" />
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Project
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Cost code
                </th>
                <th
                  className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none"
                  onClick={() => handleSort("due_date")}
                >
                  Due <SortIcon field="due_date" />
                </th>
                <th
                  className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none"
                  onClick={() => handleSort("amount")}
                >
                  Amount <SortIcon field="amount" />
                </th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Action
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Draw</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={selectMode ? 10 : 9} className="px-4 py-10 text-center text-sm text-gray-400">
                    No invoices match these filters.
                  </td>
                </tr>
              ) : sortedRows.map((inv, rowIdx) => {
                const effectiveStatus = statusOverrides[inv.id] ?? inv.status;
                const isNeedsAttention =
                  effectiveStatus === "pending_review" && needsAttention.has(inv.id);
                const isSelected = selected.has(inv.id);
                const isPaid = PAID_STATUSES.has(effectiveStatus);
                const todayStr = new Date().toISOString().split("T")[0]!;
                const isPastDue = !!inv.due_date && !isPaid && inv.due_date < todayStr;
                const isFocused = focusedIndex === rowIdx;
                const pastDueDays = isPastDue && inv.due_date
                  ? Math.floor((new Date(todayStr).getTime() - new Date(inv.due_date).getTime()) / 86400000)
                  : 0;
                return (
                    <tr
                      key={inv.id}
                      data-row-index={rowIdx}
                      onClick={() => !selectMode && router.push(`/invoices/${inv.id}`)}
                      className={`transition-colors group cursor-pointer ${
                        isSelected
                          ? "bg-[color:var(--tint-active)]"
                          : isPastDue
                            ? "hover:brightness-95"
                            : "hover:bg-gray-50"
                      } ${isFocused ? "ring-2 ring-inset ring-[color:var(--brand-blue)]/40" : ""}`}
                      style={isPastDue ? { borderLeft: "3px solid var(--status-over)", backgroundColor: "var(--tint-over)" } : undefined}
                    >
                      {selectMode && (
                        <td className="px-4 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleOne(inv.id, e.target.checked)}
                            className="rounded border-gray-300 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
                          />
                        </td>
                      )}
                    {/* Status dot + draw indicator */}
                    <td className="w-10 px-2 py-2 align-middle">
                      <div className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: STATUS_DOT_COLOR[effectiveStatus] ?? "var(--status-neutral)",
                          }}
                          title={STATUS_CHIP_LABEL[effectiveStatus] ?? effectiveStatus}
                        />
                        {inv.in_draw && (
                          <Link
                            href={`/draws/${inv.in_draw.id}`}
                            onClick={(e) => e.stopPropagation()}
                            title={
                              inv.in_draw.draw_date
                                ? `In draw request — ${inv.in_draw.draw_date}${inv.in_draw.status ? ` (${inv.in_draw.status})` : ""}`
                                : "In draw request"
                            }
                            className="text-[color:var(--brand-blue)] hover:text-[#3461de] transition-colors flex-shrink-0"
                          >
                            <Landmark size={13} />
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-semibold text-gray-900 text-sm">
                        {inv.vendor ?? " - "}
                        <span className="ml-1.5 text-xs font-normal text-gray-400">{inv.invoice_number ?? "No #"}</span>
                      </p>
                      <p className="text-[10px] flex items-center gap-1.5 mt-0.5">
                        {isPastDue && (
                          <span className="font-medium" style={{ color: "var(--status-over)" }}>
                            Past due · {pastDueDays}d
                          </span>
                        )}
                        {isNeedsAttention && (
                          <span className="inline-flex items-center gap-0.5 font-bold uppercase tracking-wide" style={{ color: "var(--status-over)" }}>
                            <AlertTriangle size={10} /> Needs attention
                          </span>
                        )}
                        {inv.pending_draw && (
                          <span className="text-[color:var(--brand-blue)] font-medium">• Draw</span>
                        )}
                        {inv.source === "email" && (
                          <span className="inline-flex items-center gap-0.5 text-[color:var(--brand-blue)]" title="Imported via Gmail">
                            <Mail size={10} />
                            <span className="font-medium">Email</span>
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-gray-600 text-xs">
                      {inv.projects?.name ?? <span className="text-gray-400">G&A</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {inv.cost_codes ? (
                        <span className="truncate">
                          <span className="text-gray-700">{inv.cost_codes.name}</span>
                          <span className="text-gray-400 ml-1 tabular-nums">{inv.cost_codes.code}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-2 text-xs font-medium whitespace-nowrap"
                      style={{ color: isPastDue ? "var(--status-over)" : undefined }}
                    >
                      <span className={!isPastDue ? "text-gray-600" : ""}>{fmtDate(inv.due_date)}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-semibold text-gray-900 tabular-nums">{fmt(inv.amount)}</span>
                      {(inv.discount_taken ?? 0) > 0 && (
                        <span className="block text-[10px] text-green-600 tabular-nums">
                          Disc: {fmt(inv.discount_taken)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 relative text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1 justify-end">
                        {effectiveStatus === "pending_review" && (
                          <button
                            title={isNeedsAttention && !inv.manually_reviewed ? "Needs attention — fix vendor, cost code, and amount first" : "Approve invoice (a)"}
                            onClick={(e) => {
                              e.stopPropagation();
                              approveRow(inv.id);
                            }}
                            disabled={isPending || (isNeedsAttention && !inv.manually_reviewed)}
                            className="px-3 py-1 rounded-md text-xs font-semibold text-white disabled:opacity-40 whitespace-nowrap inline-flex items-center gap-1 transition-colors"
                            style={{ backgroundColor: "var(--brand-blue)" }}
                          >
                            <Check size={12} />
                            Approve
                          </button>
                        )}

                        {effectiveStatus === "approved" && (
                          <button
                            title="Record payment"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPayMenuFor(payMenuFor === inv.id ? null : inv.id);
                              setMoreMenuFor(null);
                            }}
                            disabled={isPending}
                            className="px-3 py-1 rounded-md text-xs font-semibold border disabled:opacity-40 whitespace-nowrap inline-flex items-center gap-1 transition-colors hover:bg-gray-50"
                            style={{ borderColor: "var(--border-strong)", color: "#334155" }}
                          >
                            <CreditCard size={12} />
                            Pay
                            <ChevDown size={10} />
                          </button>
                        )}

                        {(effectiveStatus === "released" || effectiveStatus === "cleared" || effectiveStatus === "void") && (
                          <span className="text-xs text-gray-400 capitalize whitespace-nowrap">
                            {effectiveStatus === "released" ? "Released" : effectiveStatus === "cleared" ? "Cleared" : "Void"}
                          </span>
                        )}

                        {payMenuFor === inv.id && effectiveStatus === "approved" && (
                          <div ref={popRef} className="absolute right-0 top-full mt-1 z-20 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-sm">
                            <button
                              onClick={() => {
                                const next = !(drawOverrides[inv.id] ?? (inv.pending_draw ?? false));
                                setDrawOverrides((p) => ({ ...p, [inv.id]: next }));
                                setPayMenuFor(null);
                                startTransition(async () => {
                                  const r = await setPendingDraw(inv.id, next);
                                  if (r.error) {
                                    setDrawOverrides((p) => ({ ...p, [inv.id]: !next }));
                                    setBanner({ type: "error", msg: r.error });
                                  } else {
                                    setBanner({ type: "success", msg: next ? "Added to next draw" : "Removed from draw" });
                                  }
                                });
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <FileText size={14} className="text-blue-600" />
                              <div>
                                <div className="font-medium text-gray-900">
                                  {(drawOverrides[inv.id] ?? (inv.pending_draw ?? false)) ? "Remove from draw" : "Add to next draw"}
                                </div>
                                <div className="text-[11px] text-gray-500">Pays via lender draw request</div>
                              </div>
                            </button>
                            <button
                              onClick={() => {
                                setPayMenuFor(null);
                                router.push(`/banking/payments?new=1&invoice=${inv.id}`);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <CreditCard size={14} className="text-purple-600" />
                              <div>
                                <div className="font-medium text-gray-900">Pay directly</div>
                                <div className="text-[11px] text-gray-500">Check, ACH, or wire</div>
                              </div>
                            </button>
                            {inv.vendors?.auto_draft && (
                              <ConfirmButton
                                trigger={
                                  <>
                                    <Zap size={14} className="text-amber-600" />
                                    <div>
                                      <div className="font-medium text-gray-900">Mark as auto-drafted</div>
                                      <div className="text-[11px] text-gray-500">Bank already pulled funds</div>
                                    </div>
                                  </>
                                }
                                title="Mark as auto-drafted?"
                                body="This will clear it immediately and post DR AP / CR Cash."
                                confirmLabel="Mark as auto-drafted"
                                tone="neutral"
                                onConfirm={async () => {
                                  setPayMenuFor(null);
                                  setStatusOverrides((prev) => ({ ...prev, [inv.id]: "cleared" }));
                                  const r = await payInvoiceAutoDraft(inv.id);
                                  if (r.error) {
                                    setStatusOverrides((prev) => ({ ...prev, [inv.id]: "approved" }));
                                    setBanner({ type: "error", msg: r.error });
                                    return { error: r.error };
                                  }
                                  setBanner({ type: "success", msg: "Invoice marked as auto-drafted" });
                                }}
                                triggerClassName="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                              />
                            )}
                          </div>
                        )}

                        <button
                          title="More actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoreMenuFor(moreMenuFor === inv.id ? null : inv.id);
                            setPayMenuFor(null);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 rounded transition-all"
                        >
                          <MoreVertical size={14} />
                        </button>

                        {moreMenuFor === inv.id && (
                          <div ref={popRef} className="absolute right-0 top-full mt-1 z-20 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-xs">
                            {effectiveStatus === "approved" && (
                              <ConfirmButton
                                trigger={<>Un-approve</>}
                                title="Revert to pending review?"
                                body="This moves the invoice back to pending review."
                                confirmLabel="Revert"
                                tone="neutral"
                                onConfirm={async () => {
                                  setMoreMenuFor(null);
                                  setStatusOverrides((prev) => ({ ...prev, [inv.id]: "pending_review" }));
                                  const r = await setInvoiceStatus(inv.id, "pending_review");
                                  if (r.error) {
                                    setStatusOverrides((prev) => {
                                      const n = { ...prev };
                                      delete n[inv.id];
                                      return n;
                                    });
                                    setBanner({ type: "error", msg: r.error });
                                    return { error: r.error };
                                  }
                                }}
                                triggerClassName="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                              />
                            )}
                            {(effectiveStatus === "pending_review" || effectiveStatus === "approved") && (
                              <ConfirmButton
                                trigger={<>Mark disputed</>}
                                title="Mark this invoice as disputed?"
                                body="Disputed invoices are held for further review."
                                confirmLabel="Mark disputed"
                                tone="danger"
                                onConfirm={async () => {
                                  setMoreMenuFor(null);
                                  setStatusOverrides((prev) => ({ ...prev, [inv.id]: "disputed" }));
                                  const r = await setInvoiceStatus(inv.id, "disputed");
                                  if (r.error) {
                                    setStatusOverrides((prev) => {
                                      const n = { ...prev };
                                      delete n[inv.id];
                                      return n;
                                    });
                                    setBanner({ type: "error", msg: r.error });
                                    return { error: r.error };
                                  }
                                }}
                                triggerClassName="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-amber-700"
                              />
                            )}
                            {effectiveStatus === "disputed" && (
                              <button
                                onClick={() => {
                                  setMoreMenuFor(null);
                                  setStatusOverrides((prev) => ({ ...prev, [inv.id]: "pending_review" }));
                                  startTransition(async () => {
                                    const r = await setInvoiceStatus(inv.id, "pending_review");
                                    if (r.error) {
                                      setStatusOverrides((prev) => {
                                        const n = { ...prev };
                                        delete n[inv.id];
                                        return n;
                                      });
                                      setBanner({ type: "error", msg: r.error });
                                    }
                                  });
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                              >
                                Un-dispute
                              </button>
                            )}
                            {effectiveStatus !== "void" && effectiveStatus !== "cleared" && effectiveStatus !== "released" && (
                              <ConfirmButton
                                trigger={<>Void</>}
                                title="Void this invoice?"
                                body="This cannot be easily reversed."
                                confirmLabel="Void"
                                tone="danger"
                                onConfirm={async () => {
                                  setMoreMenuFor(null);
                                  const r = await voidInvoice(inv.id);
                                  if (r.error) {
                                    setBanner({ type: "error", msg: r.error });
                                    return { error: r.error };
                                  }
                                }}
                                triggerClassName="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-red-600 border-t border-gray-100"
                              />
                            )}
                            {(effectiveStatus === "released" || effectiveStatus === "cleared") && (
                              <Link
                                href="/banking/payments"
                                onClick={() => setMoreMenuFor(null)}
                                className="block px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                              >
                                View in payment register {'>'}
                              </Link>
                            )}
                            {effectiveStatus === "void" && (
                              <span className="block px-3 py-1.5 text-gray-400 italic">No actions available</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      {effectiveStatus === "approved" && !inv.in_draw ? (
                        <input
                          type="checkbox"
                          checked={drawOverrides[inv.id] ?? (inv.pending_draw ?? false)}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setDrawOverrides((prev) => ({ ...prev, [inv.id]: next }));
                            startTransition(async () => {
                              await setPendingDraw(inv.id, next);
                            });
                          }}
                          disabled={isPending}
                          className="rounded border-gray-300 text-[color:var(--brand-blue)] focus:ring-[color:var(--brand-blue)]"
                        />
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                      <ConfirmButton
                        trigger={<Trash2 size={14} />}
                        title="Delete this invoice?"
                        body="This permanently removes the invoice."
                        confirmLabel="Delete"
                        tone="danger"
                        onConfirm={async () => {
                          await deleteInvoice(inv.id);
                        }}
                        triggerClassName="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 rounded transition-all"
                        ariaLabel="Delete invoice"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-3 z-50 animate-slide-up">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            onClick={handleApproveSelected}
            disabled={isPending}
            title="Approve all selected pending invoices"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            <Check size={13} />
            Approve
          </button>
          <button
            onClick={() => handleAddSelectedToDraw(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            <FileText size={13} />
            Add to draw
          </button>
          <button
            onClick={() => handleAddSelectedToDraw(false)}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            Remove from draw
          </button>
          <ConfirmButton
            trigger={<><Trash2 size={13} />Delete</>}
            title={`Delete ${selected.size} invoice${selected.size > 1 ? "s" : ""}?`}
            body="This cannot be undone."
            confirmLabel="Delete"
            tone="danger"
            onConfirm={handleDeleteSelected}
            triggerClassName="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          />
          <button
            onClick={exitSelectMode}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
}