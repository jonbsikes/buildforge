"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteVendorPaymentAdjustment } from "@/app/actions/draws";
import { Trash2 } from "lucide-react";

interface Props {
  adjustmentId: string;
}

export default function DeleteAdjustmentButton({ adjustmentId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await deleteVendorPaymentAdjustment(adjustmentId);
      if (!result.error) router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title="Delete adjustment"
      className="ml-1 p-0.5 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
    >
      <Trash2 size={11} />
    </button>
  );
}
