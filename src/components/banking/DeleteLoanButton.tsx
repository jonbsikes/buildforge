"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteLoan } from "@/app/actions/banking";
import ConfirmButton from "@/components/ui/ConfirmButton";

interface Props {
  loanId: string;
  loanNumber: string;
  redirectAfter?: string;
}

export default function DeleteLoanButton({ loanId, loanNumber, redirectAfter }: Props) {
  const router = useRouter();

  return (
    <ConfirmButton
      trigger={<Trash2 size={13} />}
      ariaLabel={`Delete loan ${loanNumber}`}
      triggerClassName="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
      title="Delete Loan?"
      body={
        <>
          <p className="mb-3">Permanently delete loan:</p>
          <p className="text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
            #{loanNumber}
          </p>
          <p className="text-xs text-gray-400">
            This cannot be undone. Any draw requests linked to this loan will lose the loan reference.
          </p>
        </>
      }
      confirmLabel="Delete Loan"
      onConfirm={() => deleteLoan(loanId)}
      onSuccess={() => {
        if (redirectAfter) router.push(redirectAfter);
        else router.refresh();
      }}
    />
  );
}
