"use client";

import { Trash2 } from "lucide-react";
import { deleteContract } from "@/app/actions/contracts";
import ConfirmButton from "@/components/ui/ConfirmButton";

export default function DeleteContractButton({ contractId }: { contractId: string }) {
  return (
    <ConfirmButton
      trigger={<Trash2 size={14} />}
      ariaLabel="Delete contract"
      triggerClassName="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
      title="Delete Contract?"
      body="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={() => deleteContract(contractId)}
    />
  );
}
