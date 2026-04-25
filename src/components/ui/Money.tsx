import type { CSSProperties } from "react";

export type MoneyTone = "default" | "positive" | "negative" | "muted";

type MoneyProps = {
  value: number | null | undefined;
  /** "default" | "positive" | "negative" | "muted". `auto` uses sign of value. */
  tone?: MoneyTone | "auto";
  /** Show decimals (cents). Default: false (whole-dollar). */
  decimals?: boolean;
  /** Render +/- prefix for non-zero values. */
  showSign?: boolean;
  /** Render negatives in accountant-style parentheses. Default: true. */
  parens?: boolean;
  /** Skeleton dash for null/undefined. Default: "—". */
  emptyChar?: string;
  className?: string;
  style?: CSSProperties;
};

const TONE_STYLE: Record<MoneyTone, string> = {
  default: "text-[color:var(--text-primary)]",
  positive: "text-[color:var(--status-complete)]",
  negative: "text-[color:var(--status-over)]",
  muted: "text-[color:var(--text-muted)]",
};

/**
 * Single source of truth for currency rendering.
 *
 * - USD format, optional cents.
 * - Negatives render as `($1,234)` (accountant convention) by default.
 * - `tone="auto"` colors red on negative, green on positive.
 * - Tabular numerics by default.
 *
 * Per UI Review § 01 #08.
 */
export default function Money({
  value,
  tone = "default",
  decimals = false,
  showSign = false,
  parens = true,
  emptyChar = "—",
  className = "",
  style,
}: MoneyProps) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span
        className={`tabular-nums text-[color:var(--text-muted)] ${className}`}
        style={style}
      >
        {emptyChar}
      </span>
    );
  }

  const resolvedTone: MoneyTone =
    tone === "auto"
      ? value < 0
        ? "negative"
        : value > 0
        ? "positive"
        : "muted"
      : tone;

  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(abs);

  let display: string;
  if (value < 0) {
    display = parens ? `(${formatted})` : `-${formatted}`;
  } else if (showSign && value > 0) {
    display = `+${formatted}`;
  } else {
    display = formatted;
  }

  return (
    <span
      className={`tabular-nums ${TONE_STYLE[resolvedTone]} ${className}`}
      style={style}
    >
      {display}
    </span>
  );
}
