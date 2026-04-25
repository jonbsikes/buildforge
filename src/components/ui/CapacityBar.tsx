import type { CSSProperties } from "react";

type CapacityBarProps = {
  /** Used capacity. */
  used: number;
  /** Total capacity. */
  total: number;
  /** Display label, e.g. "284 MB / 500 MB" or "$842K of $1.2M". Optional. */
  label?: string;
  /** Tone override. Default tints amber at 80% and red at 100%. */
  tone?: "default" | "ok" | "warn" | "over";
  /** Compact (3px) or default (6px) bar. */
  size?: "sm" | "md";
  className?: string;
  style?: CSSProperties;
};

const COLOR: Record<NonNullable<CapacityBarProps["tone"]>, string> = {
  default: "var(--brand-blue)",
  ok: "var(--status-complete)",
  warn: "var(--status-warning)",
  over: "var(--status-over)",
};

/**
 * Single-direction progress / capacity bar. Used for storage limits, draw
 * availability, contract progress, etc. Per UI Review § 19.
 */
export default function CapacityBar({
  used,
  total,
  label,
  tone,
  size = "md",
  className = "",
  style,
}: CapacityBarProps) {
  const safeTotal = total > 0 ? total : 0;
  const pct = safeTotal === 0 ? 0 : Math.min(100, Math.round((used / safeTotal) * 1000) / 10);

  const autoTone: NonNullable<CapacityBarProps["tone"]> =
    pct >= 100 ? "over" : pct >= 80 ? "warn" : "default";
  const resolvedTone = tone ?? autoTone;

  const heightClass = size === "sm" ? "h-1" : "h-1.5";

  return (
    <div className={className} style={style}>
      {label && (
        <div className="flex justify-between items-baseline mb-1 text-[11px] text-[color:var(--text-secondary)] tabular-nums">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div
        className={`w-full ${heightClass} rounded-full bg-[color:var(--surface-secondary)] overflow-hidden`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, pct)}%`,
            backgroundColor: COLOR[resolvedTone],
          }}
        />
      </div>
    </div>
  );
}
