"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

type Tone = "danger" | "neutral";

interface Props {
  trigger: ReactNode;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  onConfirm: () => Promise<unknown> | unknown;
  onSuccess?: () => void;
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}

export default function ConfirmButton({
  trigger,
  title,
  body,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onSuccess,
  triggerClassName,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const confirmCls =
    tone === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-[#4272EF] text-white hover:bg-[#3461de]";

  function close() {
    setOpen(false);
    setError(null);
    // Restore focus to the trigger so keyboard users aren't dropped to <body>.
    triggerRef.current?.focus();
  }

  // Escape closes the dialog (unless a confirm is in flight).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPending]);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await onConfirm();
        if (result && typeof result === "object" && "error" in result) {
          const err = (result as { error?: string }).error;
          if (err) {
            setError(err);
            return;
          }
        }
        close();
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
        aria-label={ariaLabel}
      >
        {trigger}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !isPending && close()}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full"
          >
            <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
            {body && <div className="text-sm text-gray-500 mb-4">{body}</div>}
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                autoFocus
                onClick={close}
                disabled={isPending}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className={`px-4 py-2 text-sm rounded-lg disabled:opacity-60 ${confirmCls}`}
              >
                {isPending ? "Working…" : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
