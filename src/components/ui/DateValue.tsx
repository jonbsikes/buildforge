import type { CSSProperties } from "react";

export type DateKind = "absolute" | "relative" | "smart";

type DateValueProps = {
  value: string | Date | null | undefined;
  /** "absolute" = "Mar 14" / "Mar 14, 2026"; "relative" = "in 3d" / "5d ago"; "smart" = relative if ≤7d, else absolute. */
  kind?: DateKind;
  /** Force inclusion of year on absolute. Default: include year only when not current year. */
  withYear?: boolean;
  /** Skeleton dash for null/undefined. Default: "—". */
  emptyChar?: string;
  className?: string;
  style?: CSSProperties;
};

function toDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  // Date-only strings ("2026-06-09") parse as UTC midnight via new Date(),
  // which renders as the previous day in US timezones. Parse as local instead.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(v);
}

function dayDiff(a: Date, b: Date): number {
  const ms = 24 * 60 * 60 * 1000;
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da - db) / ms);
}

function formatAbsolute(d: Date, withYear: boolean | undefined): string {
  const now = new Date();
  const includeYear = withYear ?? d.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(d);
}

function formatRelative(d: Date): string {
  const now = new Date();
  const diff = dayDiff(d, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0 && diff <= 30) return `in ${diff}d`;
  if (diff < 0 && diff >= -30) return `${Math.abs(diff)}d ago`;
  return formatAbsolute(d, false);
}

/**
 * Single source of truth for date rendering.
 *
 * - kind="smart" (recommended for dashboards/lists): relative when ≤7 days,
 *   otherwise absolute. Construction users care about "due in 3 days" more
 *   than "Mar 27".
 *
 * Per UI Review § 01 #09.
 */
export default function DateValue({
  value,
  kind = "absolute",
  withYear,
  emptyChar = "—",
  className = "",
  style,
}: DateValueProps) {
  if (!value) {
    return (
      <span
        className={`tabular-nums text-[color:var(--text-muted)] ${className}`}
        style={style}
      >
        {emptyChar}
      </span>
    );
  }
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) {
    return (
      <span
        className={`tabular-nums text-[color:var(--text-muted)] ${className}`}
        style={style}
      >
        {emptyChar}
      </span>
    );
  }

  let display: string;
  if (kind === "absolute") {
    display = formatAbsolute(d, withYear);
  } else if (kind === "relative") {
    display = formatRelative(d);
  } else {
    const diff = dayDiff(d, new Date());
    display = Math.abs(diff) <= 7 ? formatRelative(d) : formatAbsolute(d, withYear);
  }

  return (
    <span
      className={`tabular-nums ${className}`}
      style={style}
    >
      {display}
    </span>
  );
}
