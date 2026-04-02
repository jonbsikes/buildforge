"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Eye, Pencil, Trash2 } from "lucide-react";
import { deleteInvoice } from "@/app/actions/invoices";

interface Props {
  invoiceId: string;
  status: string;
  vendorName: string;
  invoiceNumber: string | null;
}

export default function InvoiceRowActions({ invoiceId, status, vendorName, invoiceNumber }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isEditable = status !== "paid";

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteInvoice(invoiceId);
      if (result?.error) {
        setDeleteError(result.error);
        setConfirmDelete(false);
      }
      // On success deleteInvoice redirects — never reaches here
    });
  }

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Invoice actions"
        >
          <MoreVertical size={16} />
        </button>

        {open && (
          <div className="absolute right-0 top-8 z-20 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); router.push(`/invoices/${invoiceId}`); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Eye size={14} className="text-gray-400" />
              View
            </button>
            {isEditable && (
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); router.push(`/invoices/${invoiceId}/edit`); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Pencil size={14} className="text-gray-400" />
                Edit
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); setConfirmDelete(true); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Delete Invoice?</h2>
            <p className="text-sm text-gray-500 mb-3">Permanently delete:</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
              <p className="text-sm font-medium text-gray-900">{vendorName}</p>
              {invoiceNumber && <p className="text-xs text-gray-500 mt-0.5">#{invoiceNumber}</p>}
            </div>
            <p className="text-xs text-gray-400 mb-5">
              All line items and draw associations will be removed. This cannot be undone.
            </p>
            {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
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
                {isPending ? "Deleting…" : "Delete Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
