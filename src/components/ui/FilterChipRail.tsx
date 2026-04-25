"use client";

import type { ReactNode } from "react";
import type { StatusKind } from "./StatusBadge";

export type FilterChip<T extends string = string> = {
  id: T;
  label: ReactNode;
  count?: number;
  /** Status kind for the small leading dot (optional). */
  tone?: StatusKind;
  disabled?: boolean;
};

type FilterChipRailProps<T extends string> = {
  chips: FilterChip<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  /** Visual size. */
  size?: "sm" | "md";
};

const TONE_DOT: Record<StatusKind, string> = {
  complete: "var(--status-complete)",
  active: "var(--status-active)",
  delayed: "var(--status-delayed)",
  warning: "var(--status-warning)",
  over: "var(--status-over)",
  planned: "var(--status-planned)",
  neutral: "var(--status-neutral)",
};

/**
 * Horizontal chip rail. Used for AP "Needs review / Approved / Released",
 * Vendors "All / Active / Expired / Expiring", Documents folder filter, etc.
 *
 * Per UI Review § 06 #36, § 10 #61, § 13 #73, § 04 #27.
 */
export default function FilterChipRail<T extends string>({
  chips,
  active,
  onChange,
  className = "",
  size = "md",
}: FilterChipRailProps<T>) {
  const padding = size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5";
  const text = size === "sm" ? "text-[11px]" : "text-xs";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {chips.map((c) => {
        const isActive = c.id === active;
        return (
          <button
            key={c.id}
            type="button"
            disabled={c.disabled}
            onClick={() => onChange(c.id)}
            className={`inline-flex items-center gap-1.5 ${padding} ${text} font-medium rounded-full transition-colors ${
              isActive
                ? "bg-[#4272EF] text-white"
                : "bg-[color:var(--surface-secondary)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            } ${c.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            aria-pressed={isActive}
          >
            {c.tone && !isActive && (
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: TONE_DOT[c.tone] }}
              />
            )}
            <span>{c.label}</span>
            {c.count !== undefined && (
              <span
                className={`tabular-nums text-[10px] ${
                  isActive ? "text-white/80" : "text-[color:var(--text-muted)]"
                }`}
              >
                {c.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
