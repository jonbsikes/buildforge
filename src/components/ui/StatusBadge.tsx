import type { ReactNode } from "react";

export type StatusKind =
  | "complete"
  | "active"
  | "delayed"
  | "warning"
  | "over"
  | "planned"
  | "neutral";

const DOT_VAR: Record<StatusKind, string> = {
  complete: "var(--status-complete)",
  active: "var(--status-active)",
  delayed: "var(--status-delayed)",
  warning: "var(--status-warning)",
  over: "var(--status-over)",
  planned: "var(--status-planned)",
  neutral: "var(--status-neutral)",
};

const SIZE: Record<"sm" | "md", { text: string; dot: string }> = {
  sm: { text: "text-[11px]", dot: "w-1.5 h-1.5" },
  md: { text: "text-[12px]", dot: "w-2 h-2" },
};

type NewProps = {
  status: StatusKind;
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
};

type LegacyProps = {
  status: string;
  children?: undefined;
  size?: "sm" | "md";
  className?: string;
};

type StatusBadgeProps = NewProps | LegacyProps;

/**
 * Dot + label status indicator. Two forms:
 *
 *   <StatusBadge status="warning">Pending approval</StatusBadge>   // preferred
 *   <StatusBadge status="pending_review" />                         // legacy — keeps existing callers rendering
 *
 * Legacy form is a transition shim. New code must use the 7-kind enum + children.
 */
export default function StatusBadge(props: StatusBadgeProps) {
  const { status, size = "md", className = "" } = props;
  const [kind, label] = resolve(status, props.children);
  const { text, dot } = SIZE[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium text-[color:var(--text-primary)] ${text} ${className}`}
    >
      <span
        className={`${dot} rounded-full flex-shrink-0`}
        style={{ backgroundColor: DOT_VAR[kind] }}
      />
      {label}
    </span>
  );
}

/* ─── Legacy mapping — remove once all callers pass {kind, children} ─── */

const LEGACY_STATUS: Record<string, { kind: StatusKind; label: string }> = {
  complete: { kind: "complete", label: "Complete" },
  completed: { kind: "complete", label: "Completed" },
  in_progress: { kind: "active", label: "In Progress" },
  not_started: { kind: "planned", label: "Not Started" },
  delayed: { kind: "delayed", label: "Delayed" },
  pending_review: { kind: "warning", label: "Pending Review" },
  approved: { kind: "active", label: "Approved" },
  released: { kind: "active", label: "Released" },
  cleared: { kind: "complete", label: "Cleared" },
  active: { kind: "active", label: "Active" },
  planning: { kind: "planned", label: "Planning" },
  pre_construction: { kind: "planned", label: "Pre-Construction" },
  on_hold: { kind: "warning", label: "On Hold" },
  disputed: { kind: "over", label: "Disputed" },
  cancelled: { kind: "over", label: "Cancelled" },
  void: { kind: "planned", label: "Void" },
};

const NEW_KINDS = new Set<StatusKind>([
  "complete",
  "active",
  "delayed",
  "warning",
  "over",
  "planned",
  "neutral",
]);

function resolve(status: string, children: ReactNode): [StatusKind, ReactNode] {
  if (NEW_KINDS.has(status as StatusKind) && children !== undefined) {
    return [status as StatusKind, children];
  }
  const legacy = LEGACY_STATUS[status];
  if (legacy) return [legacy.kind, legacy.label];
  return ["neutral", status];
}
