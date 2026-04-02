"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Mail, Trash2 } from "lucide-react";
import InvoiceActions from "./InvoiceActions";
import { deleteInvoice } from "@/app/actions/invoices";

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  scheduled: "bg-purple-100 text-purple-700",
  paid: "bg-green-100 text-green-700",
  disputed: "bg-red-100 text-red-600",
};

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

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
  projects: { id: string; name: string } | null;
};

export default function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
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

  return (
    <>
      {/* Toolbar row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {selectMode && selected.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
              Delete {selected.size}
            </button>
          )}
        </div>
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {selectMode && (
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                    />
                  </th>
                )}
                {["Vendor / Invoice", "Project", "Date", "Due", "Amount", "Status", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((inv) => {
                const isLowConf = inv.ai_confidence === "low" && inv.status === "pending_review";
                const isSelected = selected.has(inv.id);
                return (
                  <tr
                    key={inv.id}
                    className={`transition-colors group ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    {selectMode && (
                      <td className="px-4 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleOne(inv.id, e.target.checked)}
                          className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                        />
                      </td>
                    )}
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-3">
                        <p className="font-medium text-gray-900 flex items-center gap-1.5">
                          {isLowConf && <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />}
                          {inv.vendor ?? "—"}
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
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-3 text-gray-600 text-xs">
                        {inv.projects?.name ?? <span className="text-gray-400">G&A</span>}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-3 text-gray-600 text-xs">
                        {inv.invoice_date ?? "—"}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-3 text-gray-600 text-xs">
                        {inv.due_date ?? "—"}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-3 font-medium text-gray-900">
                        {fmt(inv.amount)}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/invoices/${inv.id}`} className="block px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {inv.status.replace("_", " ")}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <InvoiceActions
                        invoiceId={inv.id}
                        status={inv.status}
                        aiConfidence={inv.ai_confidence}
                        manuallyReviewed={inv.manually_reviewed ?? false}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
