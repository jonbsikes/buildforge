/**
 * VendorPaymentsPanel
 *
 * Shown on the draw detail page when the draw is "funded."
 * Displays one row per vendor with the invoices grouped under it, a check
 * number input, and a "Mark Paid" button.  Automatically posts GL entries
 * (Dr AP / Cr Cash) when a vendor is marked paid.  When every vendor is
 * paid the draw closes automatically.
 */

import { createClient } from "@/lib/supabase/server";
import { CheckCircle2, Clock } from "lucide-react";
import MarkVendorPaidForm from "./MarkVendorPaidForm";
import AdjustVendorAmountForm from "./AdjustVendorAmountForm";
import DeleteAdjustmentButton from "./DeleteAdjustmentButton";

interface Props {
  drawId: string;
}

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export default async function VendorPaymentsPanel({ drawId }: Props) {
  const supabase = await createClient();

  // Load vendor payments for this draw
  const { data: vendorPayments } = await supabase
    .from("vendor_payments")
    .select("id, vendor_name, amount, check_number, payment_date, status")
    .eq("draw_id", drawId)
    .order("vendor_name");

  if (!vendorPayments || vendorPayments.length === 0) return null;

  const vpIds = vendorPayments.map((vp) => vp.id);

  // Load invoices and adjustments in parallel
  const [{ data: links }, { data: adjustments }] = await Promise.all([
    supabase
      .from("vendor_payment_invoices")
      .select(`
        vendor_payment_id,
        invoices (
          id, invoice_number, invoice_date, amount, cost_codes ( name ), projects ( name )
        )
      `)
      .in("vendor_payment_id", vpIds),
    supabase
      .from("vendor_payment_adjustments")
      .select("id, vendor_payment_id, description, amount, created_at")
      .in("vendor_payment_id", vpIds)
      .order("created_at"),
  ]);

  // Group invoice links by vendor_payment_id
  type InvoiceRow = {
    id: string;
    invoice_number: string | null;
    invoice_date: string | null;
    amount: number | null;
    cost_code_name: string | null;
    project_name: string | null;
  };
  const invoicesByVp = new Map<string, InvoiceRow[]>();
  for (const link of links ?? []) {
    const inv = link.invoices as {
      id: string;
      invoice_number: string | null;
      invoice_date: string | null;
      amount: number | null;
      cost_codes: { name: string } | null;
      projects: { name: string } | null;
    } | null;
    if (!inv) continue;
    if (!invoicesByVp.has(link.vendor_payment_id)) {
      invoicesByVp.set(link.vendor_payment_id, []);
    }
    invoicesByVp.get(link.vendor_payment_id)!.push({
      id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      amount: inv.amount,
      cost_code_name: inv.cost_codes?.name ?? null,
      project_name: inv.projects?.name ?? null,
    });
  }

  // Group adjustments by vendor_payment_id
  type AdjRow = { id: string; description: string; amount: number };
  const adjustmentsByVp = new Map<string, AdjRow[]>();
  for (const adj of adjustments ?? []) {
    if (!adjustmentsByVp.has(adj.vendor_payment_id)) {
      adjustmentsByVp.set(adj.vendor_payment_id, []);
    }
    adjustmentsByVp.get(adj.vendor_payment_id)!.push({
      id: adj.id,
      description: adj.description,
      amount: adj.amount,
    });
  }

  const paidCount = vendorPayments.filter((vp) => vp.status === "paid").length;
  const total = vendorPayments.length;
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Check Remittances</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Enter a check number and date for each vendor, then click&nbsp;
            <span className="font-medium text-gray-600">Mark Paid</span>.
            GL entries post automatically.
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            paidCount === total
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {paidCount} / {total} paid
        </span>
      </div>

      {/* Vendor rows */}
      <div className="divide-y divide-gray-100">
        {vendorPayments.map((vp) => {
          const invoices = invoicesByVp.get(vp.id) ?? [];
          const isPaid = vp.status === "paid";

          return (
            <div
              key={vp.id}
              className={`px-5 py-4 ${isPaid ? "bg-green-50/40" : ""}`}
            >
              {/* Vendor header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {isPaid ? (
                    <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                  ) : (
                    <Clock size={16} className="text-amber-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {vp.vendor_name}
                    </p>
                    {isPaid && (
                      <p className="text-xs text-green-700 mt-0.5">
                        {vp.check_number ? `Check #${vp.check_number} · ` : ""}
                        Paid {vp.payment_date}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm font-semibold text-gray-900 flex-shrink-0">
                  {fmt(vp.amount)}
                </p>
              </div>

              {/* Invoice + adjustment breakdown */}
              {(invoices.length > 0 || (adjustmentsByVp.get(vp.id) ?? []).length > 0) && (
                <div className="mt-2 ml-6 space-y-1">
                  {/* Invoice lines */}
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between text-xs text-gray-500"
                    >
                      <span>
                        {inv.project_name ?? "—"}
                        {inv.invoice_number ? ` · #${inv.invoice_number}` : ""}
                        {inv.cost_code_name ? ` · ${inv.cost_code_name}` : ""}
                        {inv.invoice_date ? ` · ${inv.invoice_date}` : ""}
                      </span>
                      <span className="text-gray-600 font-medium">{fmt(inv.amount)}</span>
                    </div>
                  ))}

                  {/* Adjustment lines */}
                  {(adjustmentsByVp.get(vp.id) ?? []).map((adj) => (
                    <div
                      key={adj.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className={`italic flex items-center gap-0.5 ${adj.amount < 0 ? "text-red-500" : "text-blue-600"}`}>
                        {adj.description}
                        {!isPaid && (
                          <DeleteAdjustmentButton adjustmentId={adj.id} />
                        )}
                      </span>
                      <span className={`font-medium ${adj.amount < 0 ? "text-red-500" : "text-blue-600"}`}>
                        {adj.amount > 0 ? "+" : ""}{fmt(adj.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions row (only for pending) */}
              {!isPaid && (
                <div className="ml-6 mt-2 flex items-start gap-2 flex-wrap">
                  <AdjustVendorAmountForm
                    vendorPaymentId={vp.id}
                    currentAmount={vp.amount}
                  />
                  <MarkVendorPaidForm
                    vendorPaymentId={vp.id}
                    vendorPaymentAmount={vp.amount}
                    defaultDate={today}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {paidCount === total
            ? "All checks written — draw will close automatically."
            : `${total - paidCount} check${total - paidCount !== 1 ? "s" : ""} remaining`}
        </p>
        <p className="text-sm font-semibold text-gray-900">
          {fmt(vendorPayments.reduce((s, vp) => s + (vp.amount ?? 0), 0))}
        </p>
      </div>
    </div>
  );
}
