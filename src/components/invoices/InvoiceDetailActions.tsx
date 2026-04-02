"use client";

import { useState, useTransition } from "react";
import { advanceInvoiceStatus, disputeInvoice } from "@/app/actions/invoices";

interface Props {
  invoiceId: string;
  status: string;
}

export default function InvoiceDetailActions({ invoiceId, status }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("check");

  if (status === "paid") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-green-600 font-medium">Invoice paid and closed.</p>
      </div>
    );
  }

  if (status !== "pending_review" && status !== "approved") return null;

  function handlePay() {
    startTransition(async () => {
      const result = await advanceInvoiceStatus(invoiceId, "paid", paymentDate, paymentMethod);
      if (result.error) setError(result.error);
      else setShowPaymentForm(false);
    });
  }

  function handleDispute() {
    setError(null);
    startTransition(async () => {
      const result = await disputeInvoice(invoiceId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Actions</h3>

      {status === "approved" && !showPaymentForm && (
        <button
          onClick={() => setShowPaymentForm(true)}
          className="px-4 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
        >
          Mark as Paid
        </button>
      )}

      {showPaymentForm && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Record Payment</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Payment Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
              >
                <option value="check">Check</option>
                <option value="ach">ACH</option>
                <option value="wire">Wire</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePay}
              disabled={isPending}
              className="px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Confirm Payment"}
            </button>
            <button
              onClick={() => setShowPaymentForm(false)}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showPaymentForm && (
        <button
          onClick={handleDispute}
          disabled={isPending}
          className="px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-60"
        >
          Dispute
        </button>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
