"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteLoan } from "@/app/actions/banking";
import { useRouter } from "next/navigation";

interface Props {
  loanId: string;
  loanNumber: string;
  redirectAfter?: string;
}

export default function DeleteLoanButton({ loanId, loanNumber, redirectAfter }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteLoan(loanId);
      if (result.error) {
        setError(result.error);
        setOpen(false);
      } else {
        if (redirectAfter) router.push(redirectAfter);
        else router.refresh();
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
      >
        <Trash2 size={13} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Delete Loan?</h2>
            <p className="text-sm text-gray-500 mb-3">
              Permanently delete loan:
            </p>
            <p className="text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
              #{loanNumber}
            </p>
            <p className="text-xs text-gray-400 mb-5">
              This cannot be undone. Any draw requests linked to this loan will lose the loan reference.
            </p>
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {isPending ? "Deleting…" : "Delete Loan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
