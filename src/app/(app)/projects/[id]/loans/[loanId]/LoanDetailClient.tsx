// @ts-nocheck
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, ChevronDown, ChevronRight, CheckCircle2, Clock, DollarSign, X } from "lucide-react";
import type { Database, DrawStatus, PaymentType } from "@/types/database";

type Loan = Database["public"]["Tables"]["loans"]["Row"];
type Draw = Database["public"]["Tables"]["loan_draws"]["Row"] & { loan_draw_items?: DrawItem[] };
type DrawItem = Database["public"]["Tables"]["loan_draw_items"]["Row"] | { id: string; draw_id: string; cost_code: number | null; invoice_id: string | null; description: string; amount: number };
type Payment = Database["public"]["Tables"]["loan_payments"]["Row"];
type Invoice = { id: string; invoice_number: string | null; vendor: string | null; amount: number | null; total_amount: number | null; cost_code: number | null; status: string };
type CostCode = { code: number; description: string };
type Contact = { id: string; name: string };

interface Props {
  projectId: string;
  loan: Loan;
  draws: Draw[];
  payments: Payment[];
  availableInvoices: Invoice[];
  costCodes: CostCode[];
  contacts: Contact[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const drawStatusConfig: Record<DrawStatus, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600" },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700" },
  approved: { label: "Approved", color: "bg-violet-100 text-violet-700" },
  funded: { label: "Funded", color: "bg-green-100 text-green-700" },
};

export default function LoanDetailClient({ projectId, loan, draws: initialDraws, payments: initialPayments, availableInvoices, costCodes, contacts }: Props) {
  const supabase = createClient();
  const [draws, setDraws] = useState<Draw[]>(initialDraws);
  const [payments, setPayments] = useState<Payment[]>(initialPayments);
  const [expandedDraw, setExpandedDraw] = useState<string | null>(null);
  const [showNewDraw, setShowNewDraw] = useState(false);
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [saving, setSaving] = useState(false);

  // New draw form
  const [drawNotes, setDrawNotes] = useState("");
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());

  // New payment form
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentType, setPaymentType] = useState<PaymentType>("interest");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const fundedDraws = draws.filter((d) => d.status === "funded");
  const totalDrawn = fundedDraws.reduce((s, d) => s + (d.amount_approved ?? 0), 0);
  const available = loan.total_amount - totalDrawn;

  // Accrued interest (simple calc on drawn balance)
  const daysSinceLastPayment = payments.length > 0
    ? Math.floor((Date.now() - new Date(payments[payments.length - 1].payment_date).getTime()) / 86400000)
    : 0;
  const accruedInterest = totalDrawn * (loan.interest_rate / 365) * Math.max(daysSinceLastPayment, 0);

  // Invoices not yet in a funded draw
  const usedInvoiceIds = new Set(draws.flatMap((d) => (d.loan_draw_items ?? []).map((i: { invoice_id: string | null }) => i.invoice_id).filter(Boolean)));
  const unusedInvoices = availableInvoices.filter((i) => !usedInvoiceIds.has(i.id));

  async function createDraw() {
    setSaving(true);
    const selInvoices = availableInvoices.filter((i) => selectedInvoices.has(i.id));
    const totalRequested = selInvoices.reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0);
    const nextNumber = draws.length + 1;

    const { data: draw, error } = await supabase.from("loan_draws").insert({
      loan_id: loan.id,
      draw_number: nextNumber,
      amount_requested: totalRequested,
      status: "draft",
      notes: drawNotes || null,
    }).select("*").single();

    if (!error && draw) {
      // Insert draw items
      if (selInvoices.length > 0) {
        await supabase.from("loan_draw_items").insert(
          selInvoices.map((inv) => ({
            draw_id: draw.id,
            cost_code: inv.cost_code ?? null,
            invoice_id: inv.id,
            description: `${inv.vendor ?? "Unknown"} ${inv.invoice_number ? `#${inv.invoice_number}` : ""}`.trim(),
            amount: inv.amount ?? inv.total_amount ?? 0,
          }))
        );
      }
      setDraws((prev) => [...prev, { ...draw, loan_draw_items: [] }]);
      setShowNewDraw(false);
      setSelectedInvoices(new Set());
      setDrawNotes("");
    }
    setSaving(false);
  }

  async function advanceDrawStatus(draw: Draw) {
    const next: Record<DrawStatus, DrawStatus | null> = {
      draft: "submitted", submitted: "approved", approved: "funded", funded: null,
    };
    const nextStatus = next[draw.status as DrawStatus];
    if (!nextStatus) return;
    const updates: Partial<Draw> = { status: nextStatus };
    if (nextStatus === "funded") {
      updates.funded_date = new Date().toISOString().split("T")[0];
      updates.amount_approved = draw.amount_requested;
    }
    if (nextStatus === "submitted") {
      updates.submitted_date = new Date().toISOString().split("T")[0];
    }
    await supabase.from("loan_draws").update(updates).eq("id", draw.id);
    setDraws((prev) => prev.map((d) => d.id === draw.id ? { ...d, ...updates } : d));
  }

  async function recordPayment() {
    setSaving(true);
    const { data, error } = await supabase.from("loan_payments").insert({
      loan_id: loan.id,
      payment_date: paymentDate,
      payment_type: paymentType,
      amount: parseFloat(paymentAmount) || 0,
      notes: paymentNotes || null,
    }).select("*").single();
    if (!error && data) {
      setPayments((prev) => [...prev, data as Payment].sort((a, b) => a.payment_date.localeCompare(b.payment_date)));
      setShowNewPayment(false);
      setPaymentAmount("");
      setPaymentNotes("");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      {/* Loan summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{loan.loan_number ?? "Loan"}</h2>
            <p className="text-sm text-gray-500 capitalize">{loan.loan_type} · {(loan.interest_rate * 100).toFixed(2)}% {loan.rate_type}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            loan.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}>{loan.status.replace("_", " ")}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Commitment", value: fmt(loan.total_amount), color: "text-gray-900" },
            { label: "Total Drawn", value: fmt(totalDrawn), color: "text-gray-900" },
            { label: "Available", value: fmt(available), color: available < 0 ? "text-red-600" : "text-green-600" },
            { label: "Accrued Interest", value: fmt(accruedInterest), color: "text-amber-600" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-gray-400 flex gap-4">
          <span>Origination: {fmtDate(loan.origination_date)}</span>
          <span>Maturity: {fmtDate(loan.maturity_date)}</span>
        </div>
      </div>

      {/* Draws */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Draw Requests</h2>
          <button onClick={() => setShowNewDraw(true)}
            className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400 font-medium">
            <Plus size={14} /> New Draw
          </button>
        </div>

        {/* New draw form */}
        {showNewDraw && (
          <div className="px-5 py-4 bg-amber-50 border-b border-amber-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-amber-900">Draw #{draws.length + 1}</h3>
              <button onClick={() => setShowNewDraw(false)}><X size={16} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            {unusedInvoices.length > 0 ? (
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                <p className="text-xs font-medium text-gray-600">Select invoices to include:</p>
                {unusedInvoices.map((inv) => (
                  <label key={inv.id} className="flex items-center gap-3 cursor-pointer hover:bg-amber-100 rounded px-2 py-1">
                    <input type="checkbox" checked={selectedInvoices.has(inv.id)}
                      onChange={(e) => {
                        const next = new Set(selectedInvoices);
                        if (e.target.checked) next.add(inv.id); else next.delete(inv.id);
                        setSelectedInvoices(next);
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-amber-500" />
                    <span className="flex-1 text-sm text-gray-700">{inv.vendor ?? "Unknown"} {inv.invoice_number ? `#${inv.invoice_number}` : ""}</span>
                    <span className="text-sm font-medium text-gray-900">{fmt(inv.amount ?? inv.total_amount ?? 0)}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-4">No approved invoices available. Approve invoices in Accounts Payable first.</p>
            )}
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1">Notes</p>
              <input value={drawNotes} onChange={(e) => setDrawNotes(e.target.value)}
                placeholder="Optional notes for this draw"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            {selectedInvoices.size > 0 && (
              <p className="text-sm font-medium text-gray-800 mb-3">
                Total requested: {fmt(availableInvoices.filter((i) => selectedInvoices.has(i.id)).reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0))}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={createDraw} disabled={saving}
                className="bg-amber-500 text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50">
                {saving ? "Creating…" : "Create Draw"}
              </button>
              <button onClick={() => setShowNewDraw(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {draws.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">No draws yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {draws.map((draw) => {
              const cfg = drawStatusConfig[draw.status as DrawStatus] ?? drawStatusConfig.draft;
              const isExpanded = expandedDraw === draw.id;
              const items = draw.loan_draw_items ?? [];
              return (
                <div key={draw.id}>
                  <div className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedDraw(isExpanded ? null : draw.id)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">Draw #{draw.draw_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Requested: {fmt(draw.amount_requested)}
                        {draw.amount_approved != null && <span> · Approved: {fmt(draw.amount_approved)}</span>}
                        {draw.submitted_date && <span> · Submitted: {fmtDate(draw.submitted_date)}</span>}
                        {draw.funded_date && <span> · Funded: {fmtDate(draw.funded_date)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {draw.status !== "funded" && (
                        <button onClick={(e) => { e.stopPropagation(); advanceDrawStatus(draw); }}
                          className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 font-medium">
                          {draw.status === "draft" ? "Submit" : draw.status === "submitted" ? "Approve" : "Mark Funded"}
                        </button>
                      )}
                      {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                    </div>
                  </div>
                  {isExpanded && items.length > 0 && (
                    <div className="px-5 pb-3 bg-gray-50">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 text-xs font-medium text-gray-400">Description</th>
                            <th className="text-right py-2 text-xs font-medium text-gray-400">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {items.map((item: { id: string; description: string; amount: number }) => (
                            <tr key={item.id}>
                              <td className="py-2 text-gray-700">{item.description}</td>
                              <td className="py-2 text-right font-medium text-gray-900">{fmt(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payments */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Payments</h2>
          <button onClick={() => setShowNewPayment(true)}
            className="inline-flex items-center gap-1.5 text-sm bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 font-medium">
            <Plus size={14} /> Record Payment
          </button>
        </div>

        {showNewPayment && (
          <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="interest">Interest</option>
                  <option value="principal">Principal</option>
                  <option value="interest_reserve">Interest Reserve</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount ($)</label>
                <input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={recordPayment} disabled={saving || !paymentAmount}
                className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
                {saving ? "Saving…" : "Record"}
              </button>
              <button onClick={() => setShowNewPayment(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {payments.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">No payments recorded.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Date</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Type</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Amount</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600">{fmtDate(p.payment_date)}</td>
                  <td className="px-5 py-3 text-gray-500 capitalize text-xs">{p.payment_type.replace("_", " ")}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900">{fmt(p.amount)}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{p.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
   