"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markVendorPaymentPaid } from "@/app/actions/draws";
import { CheckCircle2 } from "lucide-react";

interface Props {
  vendorPaymentId: string;
  defaultDate: string; // today's date pre-filled
}

export default function MarkVendorPaidForm({ vendorPaymentId, defaultDate }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checkNumber, setCheckNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await markVendorPaymentPaid(vendorPaymentId, checkNumber, paymentDate);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap mt-2">
      <input
        type="text"
        placeholder="Check #"
        value={checkNumber}
        onChange={(e) => setCheckNumber(e.target.value)}
        className="w-28 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 focus:border-[#4272EF]"
      />
      <input
        type="date"
        required
        value={paymentDate}
        onChange={(e) => setPaymentDate(e.target.value)}
        className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 focus:border-[#4272EF]"
      />
      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
      >
        <CheckCircle2 size={13} />
        {isPending ? "Posting…" : "Mark Paid"}
      </button>
      {error && (
        <span className="text-xs text-red-600 w-full mt-1">{error}</span>
      )}
    </form>
  );
}
