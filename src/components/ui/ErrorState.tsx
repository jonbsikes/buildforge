"use client";

import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

type ErrorStateProps = {
  title?: string;
  description?: string;
  /** Original error for development context. */
  error?: Error & { digest?: string };
  /** If provided, renders a "Try again" button. */
  onRetry?: () => void;
  /** Extra content below the action row. */
  children?: ReactNode;
  className?: string;
};

/**
 * Standard error state for route-level error.tsx files.
 * Per UI Review § 16 #86.
 */
export default function ErrorState({
  title = "Something went wrong",
  description = "We hit an unexpected error loading this page. Try again, or report this if it keeps happening.",
  error,
  onRetry,
  children,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`text-center py-16 px-6 ${className}`}
      role="alert"
    >
      <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[color:var(--tint-over)] flex items-center justify-center text-[color:var(--status-over)]">
        <AlertTriangle size={20} />
      </div>
      <h3 className="text-base font-semibold text-[color:var(--text-primary)] mb-1.5">
        {title}
      </h3>
      <p className="text-sm text-[color:var(--text-secondary)] max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      {error?.digest && (
        <p className="text-[11px] font-mono text-[color:var(--text-muted)] mt-3">
          ref: {error.digest}
        </p>
      )}
      {onRetry && (
        <div className="mt-5">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4272EF] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <RotateCw size={14} />
            Try again
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
