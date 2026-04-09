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
  const [showClearForm, setShowClearForm] = useState(false);
  const [clearDate, setClearDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("check");

  if (status === "cleared") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-green-600 font-medium">✓ Check cleared — invoice closed.</p>
      </div>
    );
  }

  if (status === "void") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-gray-500 font-medium">Invoice voided.</p>
      </div>
    );
  }

  if (status === "disputed") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm text-red-600 font-medium">Invoice disputed — no payment actions available.</p>
      </div>
    );
  }

  if (!["pending_review", "approved", "released"].includes(status)) return null;

  function handleRelease() {
    setError(null);
    startTransition(async () => {
      const result = await advanceInvoiceStatus(invoiceId, "released", undefined, "check");
      if (result.error) setError(result.error);
    });
  }

  function handleClear() {
    setError(null);
    startTransition(async () => {
      const result = await advanceInvoiceStatus(invoiceId, "cleared", clearDate, paymentMethod);
      if (result.error) setError(result.error);
      else setShowClearForm(false);
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

      {/* Step 1: approved → released (check written, DR AP / CR 2050) */}
      {status === "approved" && !showClearForm && (
        <div className="space-y-2">
          <button
            onClick={handleRelease}
            disabled={isPending}
            className="px-4 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Issue Check"}
          </button>
          <p className="text-xs text-gray-400">Posts DR Accounts Payable / CR Checks Outstanding (2050).</p>
        </div>
      )}

      {/* Step 2: released → cleared (check clears bank, DR 2050 / CR Cash) */}
      {status === "released" && !showClearForm && (
        <div className="space-y-2">
          <button
            onClick={() => setShowClearForm(true)}
            disabled={isPending}
            className="px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
          >
            Mark Check Cleared
          </button>
          <p className="text-xs text-gray-400">Posts DR Checks Outstanding (2050) / CR Cash when check clears bank.</p>
        </div>
      )}

      {showClearForm && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Check Cleared — Record Bank Date</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date Cleared</label>
              <input
                type="date"
                value={clearDate}
                onChange={(e) => setClearDate(e.target.value)}
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
              onClick={handleClear}
              disabled={isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Confirm Cleared"}
            </button>
            <button
              onClick={() => setShowClearForm(false)}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showClearForm && status !== "released" && (
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
