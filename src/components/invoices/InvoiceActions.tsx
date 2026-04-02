"use client";

import { useState, useTransition } from "react";
import { approveInvoice } from "@/app/actions/invoices";

interface Props {
  invoiceId: string;
  status: string;
  aiConfidence: string;
  manuallyReviewed: boolean;
}

export default function InvoiceActions({ invoiceId, status, aiConfidence, manuallyReviewed }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== "pending_review") return null;

  function handleApprove(e: React.MouseEvent) {
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const result = await approveInvoice(invoiceId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      <button
        onClick={handleApprove}
        disabled={isPending}
        className="px-3 py-1 bg-[#4272EF] text-white rounded text-xs font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
      >
        {isPending ? "…" : "Approve"}
      </button>
      {error && (
        <p className="text-xs text-red-600 mt-1 max-w-[200px] leading-tight">{error}</p>
      )}
    </div>
  );
}
