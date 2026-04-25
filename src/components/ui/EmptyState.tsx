import type { ReactNode } from "react";
import Link from "next/link";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional 3-step explanation of how this page works. */
  steps?: string[];
  primary?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondary?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
};

/**
 * Standard empty-state pattern for lists/tables.
 * Per UI Review § 16 #84.
 */
export default function EmptyState({
  icon,
  title,
  description,
  steps,
  primary,
  secondary,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`text-center py-12 px-6 ${className}`}
    >
      {icon && (
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[color:var(--surface-secondary)] flex items-center justify-center text-[color:var(--text-secondary)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[color:var(--text-primary)] mb-1.5">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[color:var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      )}
      {steps && steps.length > 0 && (
        <ol className="text-xs text-[color:var(--text-secondary)] max-w-sm mx-auto mt-4 space-y-1 text-left list-decimal list-inside">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
      {primary && (
        <div className="mt-5">
          {primary.href ? (
            <Link
              href={primary.href}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-[#4272EF] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {primary.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={primary.onClick}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-[#4272EF] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {primary.label}
            </button>
          )}
        </div>
      )}
      {secondary && (
        <div className="mt-2.5">
          {secondary.href ? (
            <Link
              href={secondary.href}
              className="text-xs font-medium text-[color:var(--text-secondary)] hover:text-[#4272EF] transition-colors"
            >
              {secondary.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={secondary.onClick}
              className="text-xs font-medium text-[color:var(--text-secondary)] hover:text-[#4272EF] transition-colors"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
