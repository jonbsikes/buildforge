/**
 * Compact status indicator: colored dot + text label.
 * Consumes the canonical status tokens from globals.css.
 *
 * For new code, prefer StatusBadge — it takes the same 7-kind enum and
 * lets the caller control the label. StatusDot is kept as a legacy-status
 * convenience for dense tables where existing string codes are passed in.
 */

import type { StatusKind } from "./StatusBadge";

const KIND_VAR: Record<StatusKind, string> = {
  complete: "var(--status-complete)",
  active: "var(--status-active)",
  delayed: "var(--status-delayed)",
  warning: "var(--status-warning)",
  over: "var(--status-over)",
  planned: "var(--status-planned)",
  neutral: "var(--status-neutral)",
};

const LEGACY_TO_KIND: Record<string, { kind: StatusKind; label: string }> = {
  pending_review: { kind: "warning", label: "Pending" },
  pending: { kind: "warning", label: "Pending" },
  approved: { kind: "active", label: "Approved" },
  released: { kind: "active", label: "Released" },
  cleared: { kind: "complete", label: "Cleared" },
  disputed: { kind: "over", label: "Disputed" },
  void: { kind: "planned", label: "Void" },
  draft: { kind: "planned", label: "Draft" },
  submitted: { kind: "warning", label: "Submitted" },
  funded: { kind: "active", label: "Funded" },
  paid: { kind: "complete", label: "Paid" },
  active: { kind: "active", label: "Active" },
};

interface StatusDotProps {
  status: string;
  className?: string;
}

export default function StatusDot({ status, className = "" }: StatusDotProps) {
  const entry = LEGACY_TO_KIND[status];
  const kind: StatusKind = entry?.kind ?? "neutral";
  const label = entry?.label ?? status.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-[color:var(--text-primary)] ${className}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: KIND_VAR[kind] }}
      />
      {label}
    </span>
  );
}
