"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { removeInvoiceFromDraw } from "@/app/actions/draws";

interface Props {
  drawId: string;
  invoiceId: string;
}

export default function RemoveInvoiceButton({ drawId, invoiceId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeInvoiceFromDraw(drawId, invoiceId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <button
        onClick={handleRemove}
        disabled={isPending}
        title="Remove from draw"
        className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
      >
        <X size={14} />
      </button>
      {error && (
        <p className="text-xs text-red-600 mt-1 whitespace-nowrap">{error}</p>
      )}
    </div>
  );
}
