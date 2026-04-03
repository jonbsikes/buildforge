"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitDraw, fundDraw, markDrawPaid, deleteDraw } from "@/app/actions/draws";
import { Trash2 } from "lucide-react";

interface Props {
  drawId: string;
  status: string;
  /** True when vendor_payment records exist for this draw (new check workflow). */
  hasVendorPayments?: boolean;
}

export default function DrawActions({ drawId, status, hasVendorPayments = false }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (status === "paid") return null;

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>

      <div className="flex items-center gap-3 flex-wrap">
        {status === "draft" && (
          <>
            <button
              onClick={() => run(() => submitDraw(drawId))}
              disabled={isPending}
              className="px-4 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Submit to Bank"}
            </button>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isPending}
                className="flex items-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-60"
              >
                <Trash2 size={14} />
                Delete Draw
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Delete this draft?</span>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    startTransition(async () => {
                      const result = await deleteDraw(drawId);
                      if (result.error) setError(result.error);
                      else router.push("/draws");
                    });
                  }}
                  disabled={isPending}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {isPending ? "Deleting…" : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 w-full">Submit when ready to send to the lender.</p>
          </>
        )}

        {status === "submitted" && (
          <>
            <button
              onClick={() => run(() => fundDraw(drawId))}
              disabled={isPending}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {isPending ? "Posting…" : "Mark as Funded"}
            </button>
            <p className="text-xs text-gray-400">Posts a GL entry (Dr Cash / Cr Construction Loan Payable).</p>
          </>
        )}

        {status === "funded" && hasVendorPayments && (
          <p className="text-xs text-gray-400">
            Write checks using the remittance list above. The draw closes automatically once all vendors are paid.
          </p>
        )}

        {status === "funded" && !hasVendorPayments && (
          <>
            <button
              onClick={() => run(() => markDrawPaid(drawId))}
              disabled={isPending}
              className="px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Mark as Paid"}
            </button>
            <p className="text-xs text-gray-400">Marks all invoices in this draw as paid with today&apos;s date.</p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
