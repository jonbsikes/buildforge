"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock } from "lucide-react";
import { createDraw, type DrawableInvoice } from "@/app/actions/draws";
import type { LenderOption, LoanForDraw } from "@/app/(app)/draws/new/page";

interface Props {
  invoices: DrawableInvoice[];
  loans: LoanForDraw[];
  lenders: LenderOption[];
}

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function dueDateStatus(due: string | null): "past_due" | "due_soon" | "ok" {
  if (!due) return "ok";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  const diffDays = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "past_due";
  if (diffDays <= 5) return "due_soon";
  return "ok";
}

export default function NewDrawForm({ invoices, loans, lenders }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedLenderId, setSelectedLenderId] = useState<string>("");
  const [excludedInvoiceIds, setExcludedInvoiceIds] = useState<Set<string>>(new Set());

  const lenderLoans = useMemo(
    () => loans.filter((l) => l.lender_id === selectedLenderId),
    [loans, selectedLenderId]
  );

  const lenderProjectIds = useMemo(
    () => new Set(lenderLoans.map((l) => l.project_id)),
    [lenderLoans]
  );

  const filteredInvoices = useMemo(() => {
    if (!selectedLenderId) return [];
    return invoices.filter((inv) => inv.project?.id && lenderProjectIds.has(inv.project.id));
  }, [invoices, selectedLenderId, lenderProjectIds]);

  const selectedInvoices = useMemo(
    () => filteredInvoices.filter((inv) => !excludedInvoiceIds.has(inv.id)),
    [filteredInvoices, excludedInvoiceIds]
  );

  const total = selectedInvoices.reduce((s, inv) => s + (inv.amount ?? 0), 0);

  function toggleInvoice(id: string) {
    setExcludedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (excludedInvoiceIds.size === 0) {
      // Exclude all
      setExcludedInvoiceIds(new Set(filteredInvoices.map((inv) => inv.id)));
    } else {
      // Include all
      setExcludedInvoiceIds(new Set());
    }
  }

  // Loan breakdown for summary (only selected invoices)
  const byLoan = useMemo(() => {
    const map = new Map<string, { loanNum: string; total: number; count: number }>();
    for (const inv of selectedInvoices) {
      const key = inv.loan_number ?? "No Loan";
      const existing = map.get(key);
      if (existing) {
        existing.total += inv.amount ?? 0;
        existing.count += 1;
      } else {
        map.set(key, { loanNum: key, total: inv.amount ?? 0, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [selectedInvoices]);

  function handleSubmit() {
    setError(null);
    if (!selectedLenderId) { setError("Please select a lender"); return; }
    if (selectedInvoices.length === 0) { setError("Select at least one invoice for this draw"); return; }
    startTransition(async () => {
      const result = await createDraw(selectedLenderId, selectedInvoices.map((inv) => inv.id));
      if (result.error) {
        setError(result.error);
      } else {
        router.push(`/draws/${result.drawId}`);
      }
    });
  }

  const pastDueCount = selectedInvoices.filter((i) => dueDateStatus(i.due_date) === "past_due").length;
  const dueSoonCount = selectedInvoices.filter((i) => dueDateStatus(i.due_date) === "due_soon").length;

  return (
    <div className="space-y-5">
      {/* Lender selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Draw for lender
        </label>
        <select
          value={selectedLenderId}
          onChange={(e) => { setSelectedLenderId(e.target.value); setError(null); setExcludedInvoiceIds(new Set()); }}
          className="w-full max-w-lg px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">— Select lender —</option>
          {lenders.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        {lenders.length === 0 && (
          <p className="text-xs text-amber-600 mt-2">
            No lenders with active loans and eligible invoices found.
          </p>
        )}

        {/* Loan pills */}
        {selectedLenderId && lenderLoans.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {lenderLoans.map((l) => {
              const isLOC = l.loan_type === "line_of_credit";
              const availableCredit = isLOC && l.credit_limit != null
                ? l.credit_limit - (l.current_balance ?? 0)
                : null;
              return (
                <div key={l.id} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                  {isLOC && <span className="text-purple-600 font-medium mr-1.5">LOC</span>}
                  <span className="text-gray-400">Loan </span>
                  <span className="font-medium text-gray-800">#{l.loan_number}</span>
                  {isLOC && availableCredit != null ? (
                    <>
                      <span className="text-gray-300 mx-1.5">·</span>
                      <span className="text-gray-500">Available: </span>
                      <span className={`font-medium ${availableCredit < 0 ? "text-red-600" : "text-gray-800"}`}>
                        {fmt(availableCredit)}
                      </span>
                      <span className="text-gray-400 ml-1">of {fmt(l.credit_limit)}</span>
                    </>
                  ) : (
                    <span className="text-gray-400 ml-1.5">{fmt(l.loan_amount)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invoice preview (read-only — all will be auto-included) */}
      {selectedLenderId && filteredInvoices.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">
              Invoices ({selectedInvoices.length} of {filteredInvoices.length} selected)
            </h3>
            <span className="text-xs">
              {pastDueCount > 0 && (
                <span className="text-red-600 font-medium mr-2">{pastDueCount} past due</span>
              )}
              {dueSoonCount > 0 && (
                <span className="text-amber-600 font-medium">{dueSoonCount} due soon</span>
              )}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={excludedInvoiceIds.size === 0 && filteredInvoices.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                    title="Select / deselect all"
                  />
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Vendor / Invoice</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Loan #</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Due Date</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredInvoices.map((inv) => {
                const status = dueDateStatus(inv.due_date);
                const isPastDue = status === "past_due";
                const isDueSoon = status === "due_soon";
                const isExcluded = excludedInvoiceIds.has(inv.id);
                return (
                  <tr
                    key={inv.id}
                    className={`${isExcluded ? "opacity-50" : ""} ${isPastDue ? "bg-red-50/40" : isDueSoon ? "bg-amber-50/40" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={!isExcluded}
                        onChange={() => toggleInvoice(inv.id)}
                        className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 flex items-center gap-1.5">
                        {isPastDue && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                        {isDueSoon && <Clock size={12} className="text-amber-500 flex-shrink-0" />}
                        {inv.vendor ?? "—"}
                      </p>
                      <p className="text-xs text-gray-400">{inv.invoice_number ?? "No #"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{inv.project?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {inv.loan_number ? `#${inv.loan_number}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className={isPastDue ? "text-red-600 font-medium" : isDueSoon ? "text-amber-600 font-medium" : "text-gray-600"}>
                        {inv.due_date ?? "—"}
                        {isPastDue && " (past due)"}
                        {isDueSoon && " (due soon)"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {fmt(inv.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary + submit */}
      {selectedLenderId && filteredInvoices.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div>
                <p className="text-sm text-gray-500">
                  {selectedInvoices.length} invoice{selectedInvoices.length !== 1 ? "s" : ""} will be included
                </p>
                <p className="text-xl font-semibold text-gray-900 mt-0.5">{fmt(total)}</p>
              </div>

              {byLoan.length > 1 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Breakdown by loan</p>
                  {byLoan.map(({ loanNum, total: loanTotal, count }) => (
                    <div key={loanNum} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded px-2.5 py-1.5">
                      <span>Loan #{loanNum} · {count} invoice{count !== 1 ? "s" : ""}</span>
                      <span className="font-medium text-gray-800">{fmt(loanTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 self-center">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="px-5 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
              >
                {isPending ? "Creating…" : "Create Draft Draw"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedLenderId && filteredInvoices.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
          No eligible invoices for this lender&apos;s projects.
        </div>
      )}
    </div>
  );
}
