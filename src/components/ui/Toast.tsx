"use client";

/**
 * Single toast primitive for the app (Package 01 §Step 3).
 *
 * Replaces three hand-rolled patterns (InvoicesTable's fixed banner div,
 * inline error strings on field logs/todos, ConfirmButton's own errors).
 *
 *   const toast = useToast();
 *   toast.success("Saved");
 *   toast.error("Something went wrong");
 *
 * Fixed top-right, 4s auto-dismiss, max 3 stacked, role="status". No deps.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error";

interface ToastItem {
  id: number;
  kind: ToastKind;
  msg: string;
}

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_STACK = 3;
const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, msg: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, msg }].slice(-MAX_STACK));
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (msg: string) => push("success", msg),
      error: (msg: string) => push("error", msg),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto cursor-pointer flex items-start gap-2 rounded-lg bg-white border border-[color:var(--card-border)] shadow-md pl-3 pr-4 py-2.5 max-w-[calc(100vw-2rem)] sm:max-w-sm text-[13px] text-[color:var(--text-primary)] animate-in"
            style={{
              borderLeftWidth: 3,
              borderLeftColor:
                t.kind === "success" ? "var(--status-complete)" : "var(--status-over)",
            }}
          >
            <span className="leading-snug">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
