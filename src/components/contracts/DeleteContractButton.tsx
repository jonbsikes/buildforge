// @ts-nocheck
"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteContract } from "@/app/actions/contracts";

export default function DeleteContractButton({ contractId }: { contractId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
        title="Delete contract"
      >
        <Trash2 size={14} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-red-600 font-medium">Delete?</span>
      <button
        onClick={() => startTransition(() => deleteContract(contractId))}
        disabled={isPending}
        className="text-red-600 font-semibold hover:underline disabled:opacity-50"
      >
        Yes
      </button>
      <button onClick={() => setConfirm(false)} className="text-gray-400 hover:text-gray-600">No</button>
    </div>
  );
}
