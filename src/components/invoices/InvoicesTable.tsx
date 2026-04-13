"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Mail, Trash2, Search, ChevronUp, ChevronDown as ChevDown, Check, DollarSign } from "lucide-react";
import { deleteInvoice, setInvoiceStatus, voidInvoice, voidAfterDraw, setPendingDraw, advanceInvoiceStatus } from "@/app/actions/invoices";
import StatusDot from "@/components/ui/StatusDot";

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  released: "bg-purple-100 text-purple-700",
  cleared: "bg-green-100 text-green-700",
  disputed: "bg-red-100 text-red-600",
  void: "bg-gray-100 text-gray-500",
};

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

function getStatusDotColor(status: string): "amber" | "blue" | "purple" | "green" | "red" | "gray" {
  const colorMap: Record<string, "amber" | "blue" | "purple" | "green" | "red" | "gray"> = {
    pending_review: "amber",
    approved: "blue",
    released: "purple",
    cleared: "green",
    disputed: "red",
    void: "gray",
  };
  return colorMap[status] || "gray";
}

type SortField = "status" | "due_date" | "vendor" | "amount" | "invoice_date";
type SortDir = "asc" | "desc";

type InvoiceRow = {
  id: string;
  vendor: string | null;
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
  projects: { id: string; name: string } | null;
  cost_codes: { code: string; name: string } | null;
};

export default function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [drawOverrides, setDrawOverrides] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Search & filter state
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProject, setFilterProject] = useState("");

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
    let filtered = rows.filter((r) => {
      const effectiveStatus = statusOverrides[r.id] ?? r.status;
      if (filterStatus && effectiveStatus !== filterStatus) return false;
      if (filterProject) {
        const proj = r.projects?.name ?? "G&A";
        if (proj !== filterProject) return false;
      }
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
  }, [rows, search, filterStatus, filterProject, sortField, sortDir, statusOverrides]);

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

  function handleDeleteSelected() {
    if (!confirm(`Delete ${selected.size} invoice${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    const ids = [...selected];
    startTransition(async () => {
      await Promise.all(ids.map((id) => deleteInvoice(id)));
      exitSelectMode();
    });
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="ml-1 text-gray-300">↕</span>;
    return sortDir === "asc"
      ? <ChevronUp size={12} className="inline ml-1 text-[#4272EF]" />
      : <ChevDown size={12} className="inline ml-1 text-[#4272EF]" />;
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
      const isPaid = effectiveStatus === "cleared";
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

  return (
    <>
      {/* Summary Metric Strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Review</p>
              <p className="text-lg font-bold text-gray-900">{summaryMetrics.pendingCount}</p>
              <p className="text-xs text-gray-400">{fmt(summaryMetrics.pendingAmount)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Approved</p>
              <p className="text-lg font-bold text-gray-900">{summaryMetrics.approvedCount}</p>
              <p className="text-xs text-gray-400">{fmt(summaryMetrics.approvedAmount)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Past Due</p>
              <p className="text-lg font-bold text-gray-900">{summaryMetrics.pastDueCount}</p>
              <p className="text-xs text-gray-400">{fmt(summaryMetrics.pastDueAmount)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Pills + Search + Actions */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Status filter pills */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterStatus("")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterStatus === ""
                ? "bg-[#4272EF] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-150"
            }`}
          >
            All
          </button>
          {["pending_review", "approved", "released", "cleared", "disputed"].map((s) => {
            const labels: Record<string, string> = {
              pending_review: "Pending",
              approved: "Approved",
              released: "Released",
              cleared: "Cleared",
              disputed: "Disputed",
            };
            const count = sortedRows.filter((r) => (statusOverrides[r.id] ?? r.status) === s).length;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  filterStatus === s
                    ? "bg-[#4272EF] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-150"
                }`}
              >
                {labels[s]} <span className="text-[10px] ml-1 opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-48 ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor or invoice #..."
            className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>

        {/* Project dropdown */}
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">All Projects</option>
          {uniqueProjects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Clear button */}
        {(search || filterStatus || filterProject) && (
          <button
            onClick={() => { setSearch(""); setFilterStatus(""); setFilterProject(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 border border-gray-200 rounded-lg"
          >
            Clear
          </button>
        )}

        {/* Select mode toggle */}
        <button
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            selectMode
              ? "border-[#4272EF] text-[#4272EF] bg-blue-50"
              : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {selectMode ? "Cancel" : "Select"}
        </button>
      </div>

      <div className="text-xs text-gray-400 mb-3">
        {sortedRows.length} of {rows.length} invoice{rows.length !== 1 ? "s" : ""}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                      className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                    />
                  </th>
                )}
                <th
                  className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none"
                  onClick={() => handleSort("vendor")}
                >
                  Vendor / Invoice <SortIcon field="vendor" />
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Project
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Cost Code
                </th>
                <th
                  className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none"
                  onClick={() => handleSort("invoice_date")}
                >
                  Date <SortIcon field="invoice_date" />
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
                <th
                  className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none"
                  onClick={() => handleSort("status")}
                >
                  Status <SortIcon field="status" />
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Draw</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={selectMode ? 10 : 9} className="px-4 py-10 text-center text-sm text-gray-400">
                    No invoices match your filters.
                  </td>
                </tr>
              ) : sortedRows.map((inv) => {
                const effectiveStatus = statusOverrides[inv.id] ?? inv.status;
                const isLowConf = inv.ai_confidence === "low" && effectiveStatus === "pending_review";
                const isSelected = selected.has(inv.id);
                const isPaid = effectiveStatus === "cleared";
                const isPastDue = inv.due_date && !isPaid && inv.due_date < new Date().toISOString().split("T")[0];
                const isExpanded = expandedId === inv.id;
                return (
                  <>
                    <tr
                      key={inv.id}
                      onClick={() => !selectMode && setExpandedId(isExpanded ? null : inv.id)}
                      className={`transition-colors group cursor-pointer ${isSelected ? "bg-blue-50" : isPastDue ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-gray-50"}`}
                    >
                      {selectMode && (
                        <td className="px-4 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleOne(inv.id, e.target.checked)}
                            className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                          />
                        </td>
                      )}
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-2">
                        <p className="font-medium text-gray-900 flex items-center gap-1.5 text-sm">
                          {isLowConf && <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />}
                          {isPastDue && !isLowConf && <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />}
                          {inv.vendor ?? " - "}
                        </p>
                        <p className="text-xs text-gray-400 flex items-center gap-1.5">
                          {inv.invoice_number ?? "No #"}
                          {inv.pending_draw && <span className="text-[#4272EF] font-medium">• Draw</span>}
                          {inv.source === "email" && (
                            <span className="inline-flex items-center gap-0.5 text-[#4272EF]" title="Imported via Gmail">
                              <Mail size={11} />
                              <span className="text-[10px] font-medium">Email</span>
                            </span>
                          )}
                        </p>
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-2 text-gray-600 text-xs">
                        {inv.projects?.name ?? <span className="text-gray-400">G&A</span>}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-2 text-gray-600 text-xs">
                        {inv.cost_codes ? (
                          <span title={inv.cost_codes.name}>{inv.cost_codes.code}</span>
                        ) : (
                          <span className="text-gray-400"> - </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-2 text-gray-600 text-xs">
                        {fmtDate(inv.invoice_date)}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className={`block px-4 py-2 text-xs font-medium ${isPastDue ? "text-red-600" : "text-gray-600"}`}>
                        {fmtDate(inv.due_date)}
                        {isPastDue && <span className="ml-1 text-[10px] text-red-400">Past due</span>}
                      </Link>
                    </td>
                    <td className="px-0 py-0 text-right">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-2">
                        <span className="font-medium text-gray-900 tabular-nums">{fmt(inv.amount)}</span>
                        {(inv.discount_taken ?? 0) > 0 && (
                          <span className="block text-[10px] text-green-600 tabular-nums">
                            Disc: {fmt(inv.discount_taken)}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <StatusDot status={effectiveStatus} />
                        {/* Issue Check: approved -> released (DR AP / CR 2050) */}
                        {effectiveStatus === "approved" && (
                          <button
                            title="Issue Check"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatusOverrides((prev) => ({ ...prev, [inv.id]: "released" }));
                              startTransition(async () => {
                                const r = await advanceInvoiceStatus(inv.id, "released", undefined, "check");
                                if (r.error) setStatusOverrides((prev) => ({ ...prev, [inv.id]: "approved" }));
                              });
                            }}
                            disabled={isPending}
                            className="opacity-0 group-hover:opacity-100 ml-auto text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-lg font-medium hover:bg-purple-200 transition-all disabled:opacity-40 whitespace-nowrap"
                          >
                            Issue Check
                          </button>
                        )}
                        {/* Mark Cleared: released -> cleared (DR 2050 / CR Cash) */}
                        {effectiveStatus === "released" && (
                          <button
                            title="Mark Cleared"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatusOverrides((prev) => ({ ...prev, [inv.id]: "cleared" }));
                              startTransition(async () => {
                                const today = new Date().toISOString().split("T")[0];
                                const r = await advanceInvoiceStatus(inv.id, "cleared", today, "check");
                                if (r.error) setStatusOverrides((prev) => ({ ...prev, [inv.id]: "released" }));
                              });
                            }}
                            disabled={isPending}
                            className="opacity-0 group-hover:opacity-100 ml-auto text-xs px-2 py-1 bg-green-100 text-green-700 rounded-lg font-medium hover:bg-green-200 transition-all disabled:opacity-40 whitespace-nowrap"
                          >
                            Mark Cleared
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center" onClick={(e) => e.stopPropagation()}>
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
                        className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                      />
                    </td>
                    <td className="px-4 py-2 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm("Delete this invoice?")) return;
                          startTransition(async () => {
                            await deleteInvoice(inv.id);
                          });
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 rounded transition-all"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                  {/* Expanded row */}
                  {isExpanded && (
                    <tr className="animate-expand-down">
                      <td colSpan={selectMode ? 10 : 9} className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="text-gray-400 block mb-0.5">Source</span>
                            <span className="text-gray-700 capitalize">{inv.source ?? "upload"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block mb-0.5">AI Confidence</span>
                            <span className={`font-medium ${inv.ai_confidence === "high" ? "text-green-600" : inv.ai_confidence === "medium" ? "text-amber-600" : "text-red-600"}`}>
                              {inv.ai_confidence ?? " - "}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400 block mb-0.5">Reviewed</span>
                            <span className="text-gray-700">{inv.manually_reviewed ? "Yes" : "No"}</span>
                          </div>
                          <div>
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="inline-flex items-center gap-1 text-[#4272EF] font-medium hover:underline"
                            >
                              View Details {">"}
                            </Link>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-xl flex items-center gap-4 z-50 animate-slide-up">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            onClick={handleDeleteSelected}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            <Trash2 size={13} />
            Delete
          </button>
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