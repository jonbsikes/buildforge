"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustVendorPaymentAmount } from "@/app/actions/draws";
import { SlidersHorizontal, X } from "lucide-react";

interface Props {
  vendorPaymentId: string;
  currentAmount: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function AdjustVendorAmountForm({ vendorPaymentId, currentAmount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rawValue, setRawValue] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const adjustment = parseFloat(rawValue) || 0;
  const preview = Math.round((currentAmount + adjustment) * 100) / 100;
  const isValid = rawValue !== "" && adjustment !== 0 && preview >= 0 && description.trim() !== "";

  function handleClose() {
    setOpen(false);
    setRawValue("");
    setDescription("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setError(null);
    startTransition(async () => {
      const result = await adjustVendorPaymentAmount(vendorPaymentId, adjustment, description);
      if (result.error) {
        setError(result.error);
      } else {
        handleClose();
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
      >
        <SlidersHorizontal size={12} />
        Adjust Amount
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Description */}
        <input
          autoFocus
          type="text"
          placeholder="Description (e.g. Vendor credit)"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setError(null); }}
          className="flex-1 min-w-40 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 focus:border-[#4272EF]"
        />

        {/* +/- amount */}
        <input
          type="number"
          step="0.01"
          placeholder="+/- amount"
          value={rawValue}
          onChange={(e) => { setRawValue(e.target.value); setError(null); }}
          className="w-28 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 focus:border-[#4272EF]"
        />

        {/* Live preview */}
        {rawValue !== "" && (
          <span className={`text-xs font-medium whitespace-nowrap ${preview < 0 ? "text-red-600" : "text-gray-600"}`}>
            → {fmt(preview)}
          </span>
        )}

        <button
          type="submit"
          disabled={!isValid || isPending}
          className="px-3 py-1.5 bg-[#4272EF] text-white rounded-lg text-xs font-medium hover:bg-[#3461de] transition-colors disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={13} />
        </button>
      </div>
