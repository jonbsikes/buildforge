"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Trash2, XCircle } from "lucide-react";
import ConfirmButton from "@/components/ui/ConfirmButton";
import { useToast } from "@/components/ui/Toast";
import { voidVendorCredit, deleteVendorCredit } from "@/app/actions/vendor-credits";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}/${y}`;
}

const STATUS_DOT: Record<string, string> = {
  available: "var(--status-active)",
  fully_applied: "var(--status-complete)",
  void: "var(--status-planned)",
};

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  fully_applied: "Fully applied",
  void: "Void",
};

export type CreditRow = {
  id: string;
  credit_date: string;
  credit_number: string | null;
  amount: number;
  applied_amount: number;
  remaining: number;
  status: string;
  reason: string | null;
  vendor: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
};

export default function VendorCreditsTable({ rows }: { rows: CreditRow[] }) {
  const [, startTransition] = useTransition();
  const toast = useToast();

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-gray-100">
              <tr>
                <th className="w-6 px-2 py-2" />
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Vendor · Memo #</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Reason</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Remaining</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((c) => (
                <tr key={c.id} className="group hover:bg-gray-50">
                  <td className="w-10 px-2 py-2 align-middle">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: STATUS_DOT[c.status] ?? "var(--status-neutral)" }}
                      title={STATUS_LABEL[c.status] ?? c.status}
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtDate(c.credit_date)}</td>
                  <td className="px-4 py-2">
                    <p className="font-semibold text-gray-900 text-sm">
                      {c.vendor?.name ?? "—"}
                      {c.credit_number && (
                        <span className="ml-1.5 text-xs font-normal text-gray-400">#{c.credit_number}</span>
                      )}
                    </p>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">{c.project?.name ?? <span className="text-gray-400">G&A</span>}</td>
                  <td className="px-4 py-2 text-xs text-gray-600 max-w-xs truncate">{c.reason ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{fmt(c.amount)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium" style={{ color: c.remaining > 0 ? "var(--status-active)" : "var(--text-secondary)" }}>
                    {fmt(c.remaining)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500 capitalize">{STATUS_LABEL[c.status] ?? c.status}</td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {c.status === "available" && c.applied_amount === 0 && (
                        <ConfirmButton
                          trigger={<XCircle size={14} />}
                          title="Void this credit?"
                          body="The original DR AP / CR WIP entry will be voided. This cannot be undone."
                          confirmLabel="Void"
                          tone="danger"
                          onConfirm={async () => {
                            const r = await voidVendorCredit(c.id);
                            if (r.error) {
                              toast.error(r.error);
                              return { error: r.error };
                            }
                            toast.success("Credit voided");
                          }}
                          triggerClassName="p-1 text-gray-300 hover:text-amber-600 rounded"
                          ariaLabel="Void credit"
                        />
                      )}
                      {c.applied_amount === 0 && (
                        <ConfirmButton
                          trigger={<Trash2 size={14} />}
                          title="Delete this credit?"
                          body="This permanently removes the credit and its journal entry. Use Void if you want to keep an audit trail."
                          confirmLabel="Delete"
                          tone="danger"
                          onConfirm={async () => {
                            const promise = new Promise<void>((resolve) => {
                              startTransition(async () => {
                                const r = await deleteVendorCredit(c.id);
                                if (r.error) {
                                  toast.error(r.error);
                                } else {
                                  toast.success("Credit deleted");
                                }
                                resolve();
                              });
                            });
                            await promise;
                          }}
                          triggerClassName="p-1 text-gray-300 hover:text-red-500 rounded"
                          ariaLabel="Delete credit"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 mt-3">
        Credits are auto-applied oldest first when you issue a check to the vendor. Click a credit&apos;s vendor to filter their invoices.{" "}
        <Link href="/invoices" className="text-[#4272EF] hover:underline">Go to AP →</Link>
      </p>
    </>
  );
}
