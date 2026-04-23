import type { HTMLAttributes, ReactNode } from "react";

export type CardAccent =
  | "complete"
  | "active"
  | "delayed"
  | "warning"
  | "over"
  | "planned"
  | "neutral";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  accent?: CardAccent;
  children: ReactNode;
};

const ACCENT_VAR: Record<CardAccent, string> = {
  complete: "var(--status-complete)",
  active: "var(--status-active)",
  delayed: "var(--status-delayed)",
  warning: "var(--status-warning)",
  over: "var(--status-over)",
  planned: "var(--status-planned)",
  neutral: "var(--status-neutral)",
};

/**
 * Canonical card shell: 12px radius, 1px border, no shadow by default.
 * Pass `accent` to render a 3px left bar in the corresponding status color.
 */
export default function Card({
  accent,
  children,
  className = "",
  style,
  ...rest
}: CardProps) {
  return (
    <div
      className={`bg-[color:var(--card-bg)] border border-[color:var(--card-border)] rounded-[var(--card-radius)] p-[var(--card-padding)] ${className}`}
      style={{
        ...(accent
          ? { borderLeft: `3px solid ${ACCENT_VAR[accent]}` }
          : undefined),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
