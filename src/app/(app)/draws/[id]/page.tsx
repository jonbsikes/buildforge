// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Clock, Printer } from "lucide-react";
import DrawActions from "@/components/draws/DrawActions";
import RemoveInvoiceButton from "@/components/draws/RemoveInvoiceButton";
import VendorPaymentsPanel from "@/components/draws/VendorPaymentsPanel";
import React from "react";
import { drawDisplayName } from "@/lib/draws";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  funded:    "bg-blue-100 text-blue-700",
  paid:      "bg-green-100 text-green-700",
};

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function dueDateStatus(due: string | null): "past_due" | "due_soon" | "ok" {
  if (!due) return "ok";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "past_due";
  if (diff <= 5) return "due_soon";
  return "ok";
}

export default async function DrawDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: draw } = await supabase
    .from("loan_draws")
    .select(`id, draw_number, draw_date, total_amount, status, notes, lender_id, contacts ( id, name )`)
    .eq("id", id)
    .single();

  if (!draw) notFound();

  const { data: drawInvoices } = await supabase
    .from("draw_invoices")
    .select(`
      id, invoice_id,
      invoices (
        id, vendor, invoice_number, invoice_date, due_date, amount, file_name,
        projects ( id, name, address ),
        cost_codes ( code, name )
      )
    `)
    .eq("draw_id", id);

  const { data: glEntry } = await supabase
    .from("gl_entries")
    .select("id, entry_date, description, debit_account, credit_account, amount")
    .eq("source_id", id)
    .eq("source_type", "loan_draw")
    .maybeSingle();

  const lender = draw.contacts as { id: string; name: string } | null;
  const canEdit = draw.status !== "paid";

  // Check whether vendor payment records exist for this draw so we know
  // whether to show the legacy bulk "Mark as Paid" button or the new
  // per-vendor check remittance workflow.
  const { count: vpCount } = await supabase
    .from("vendor_payments")
    .select("id", { count: "exact", head: true })
    .eq("draw_id", id);
  const hasVendorPayments = (vpCount ?? 0) > 0;

  // Build typed invoice rows
  const rawRows = (drawInvoices ?? []).map((di) => {
    const inv = di.invoices as {
      id: string;
      vendor: string | null;
      invoice_number: string | null;
      invoice_date: string | null;
      due_date: string | null;
      amount: number | null;
      file_name: string | null;
      projects: { id: string; name: string; address: string | null } | null;
      cost_codes: { code: string; name: string } | null;
    } | null;
    return { drawInvoiceId: di.id, invoiceId: di.invoice_id, inv };
  }).filter((r) => r.inv !== null) as {
    drawInvoiceId: string;
    invoiceId: string;
    inv: {
      id: string;
      vendor: string | null;
      invoice_number: string | null;
      invoice_date: string | null;
      due_date: string | null;
      amount: number | null;
      file_name: string | null;
      projects: { id: string; name: string; address: string | null } | null;
      cost_codes: { code: string; name: string } | null;
    };
  }[];

  // Look up active loans for each project so we can show loan # per row
  const projectIds = [...new Set(rawRows.map((r) => r.inv.projects?.id).filter(Boolean) as string[])];
  const loanByProject = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: loanRows } = await supabase
      .from("loans")
      .select("project_id, loan_number, created_at")
      .in("project_id", projectIds)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    for (const l of loanRows ?? []) {
      if (!loanByProject.has(l.project_id)) loanByProject.set(l.project_id, l.loan_number);
    }
  }

  // Enrich rows with loan number
  const enrichedRows = rawRows.map((r) => ({
    ...r,
    loanNumber: r.inv.projects?.id ? (loanByProject.get(r.inv.projects.id) ?? null) : null,
  }));

  // Group by loan number (null → "No Loan")
  type LoanGroup = {
    key: string;
    loanNum: string;
    rows: typeof enrichedRows;
    subtotal: number;
  };
  const groupMap = new Map<string, LoanGroup>();
  for (const row of enrichedRows) {
    const key = row.loanNumber ?? "__none__";
    const loanNum = row.loanNumber ?? "No Loan";
    if (!groupMap.has(key)) groupMap.set(key, { key, loanNum, rows: [], subtotal: 0 });
    const g = groupMap.get(key)!;
    g.rows.push(row);
    g.subtotal += row.inv.amount ?? 0;
  }
  const loanGroups = Array.from(groupMap.values()).sort((a, b) =>
    a.loanNum.localeCompare(b.loanNum)
  );

  const colSpan = canEdit ? 6 : 5;
  const drawName = drawDisplayName(draw.draw_date);

  return (
    <>
      <Header title={drawName} />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-5">
          <Link
            href="/draws"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Draw Requests
          </Link>

          {/* Draw header card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{drawName}</h2>
                <p className="text-sm text-gray-400 mt-0.5">{lender?.name ?? "No lender"}</p>
              </div>
              <div className="flex items-center gap-2">
                {draw.status === "funded" && hasVendorPayments && (
                  <Link
                    href={`/draws/${id}/remittances`}
                    target="_blank"
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-[#4272EF] text-[#4272EF] bg-blue-50 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                  >
                    <Printer size={13} />
                    Print Remittances
                  </Link>
                )}
                <Link
                  href={`/draws/${id}/print`}
                  target="_blank"
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                >
                  <Printer size={13} />
                  Print / PDF
                </Link>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    STATUS_COLORS[draw.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {draw.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Date</p>
                <p className="text-gray-800">{draw.draw_date}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Lender</p>
                <p className="text-gray-800">{lender?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Draw Total</p>
                <p className="text-lg font-semibold text-gray-900">{fmt(draw.total_amount)}</p>
              </div>
            </div>
          </div>

          {/* GL entry (funded only) */}
          {glEntry && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-medium text-green-800 mb-1">GL Entry Posted</p>
              <p className="text-green-700 text-xs">
                {glEntry.entry_date} · Dr {glEntry.debit_account} / Cr {glEntry.credit_account} · {fmt(glEntry.amount)}
              </p>
            </div>
          )}

          {/* Check Remittances — shown when funded and vendor payment records exist */}
          {draw.status === "funded" && hasVendorPayments && (
            <VendorPaymentsPanel drawId={id} />
          )}

          {/* Invoice table grouped by loan */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">
                Invoices in this draw ({enrichedRows.length})
              </h3>
            </div>

            {enrichedRows.length === 0 ? (
              <p className="text-sm text-gray-400 px-5 py-6">No invoices in this draw.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Address</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Loan #</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Vendor / Invoice</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Category</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                    {canEdit && <th className="w-10 px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loanGroups.map((group, gi) => (
                    <React.Fragment key={group.key}>
                      {loanGroups.length > 1 && (
                        <tr className="bg-gray-50">
                          <td
                            colSpan={colSpan}
                            className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider"
                          >
                            Loan #{group.loanNum}
                          </td>
                        </tr>
                      )}
                      {group.rows.map(({ drawInvoiceId, invoiceId, inv, loanNumber }) => {
                        const status = dueDateStatus(inv.due_date);
                        const isPastDue = status === "past_due";
                        const isDueSoon = status === "due_soon";
                        const proj = inv.projects;
                        const cc = inv.cost_codes;

                        return (
                          <tr
                            key={drawInvoiceId}
                            className={
                              isPastDue ? "bg-red-50/40" : isDueSoon ? "bg-amber-50/40" : ""
                            }
                          >
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {proj?.address ?? proj?.name ?? <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {loanNumber ? `#${loanNumber}` : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900 flex items-center gap-1.5">
                                {isPastDue && <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />}
                                {isDueSoon && <Clock size={12} className="text-amber-500 flex-shrink-0" />}
                                {inv.vendor ?? "—"}
                              </p>
                              <p className="text-xs text-gray-400">{inv.invoice_number ?? "No #"}</p>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {cc ? cc.name : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {fmt(inv.amount)}
                            </td>
                            {canEdit && (
                              <td className="px-4 py-3">
                                <RemoveInvoiceButton drawId={id} invoiceId={invoiceId} />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {loanGroups.length > 1 && (
                        <tr className="border-t border-gray-100">
                          <td
                            colSpan={4}
                            className="px-4 py-2 text-xs font-semibold text-gray-500 text-right"
                          >
                            Loan #{group.loanNum} subtotal
                          </td>
                          <td className="px-4 py-2 text-right text-sm font-semibold text-gray-800">
                            {fmt(group.subtotal)}
                          </td>
                          {canEdit && <td />}
                        </tr>
                      )}
                      {gi < loanGroups.length - 1 && (
                        <tr className="h-2 bg-gray-50/50">
                          <td colSpan={colSpan} />
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td colSpan={4} className="px-4 pt-3 pb-4 text-sm font-semibold text-gray-700">
                      Grand Total
                    </td>
                    <td className="px-4 pt-3 pb-4 text-right text-sm font-semibold text-gray-900">
                      {fmt(draw.total_amount)}
                    </td>
                    {canEdit && <td />}
                  </tr>
                </tfoot>
              </table>
              </div>
            )}
          </div>

          {/* Actions */}
          <DrawActions drawId={id} status={draw.status} hasVendorPayments={hasVendorPayments} />
        </div>
      </main>
    </>
  );
}
