"use client";

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export default function ProgressRing({
  progress,
  size = 44,
  strokeWidth = 4,
  className = "",
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (progress / 100) * c;
  const colorVar =
    progress >= 70
      ? "var(--status-complete)"
      : progress >= 40
        ? "var(--brand-blue)"
        : "var(--status-warning)";

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          style={{ stroke: "var(--border-weak)" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ stroke: colorVar, transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span
        className="absolute text-xs font-bold tabular-nums"
        style={{ color: colorVar }}
      >
        {progress}%
      </span>
    </div>
  );
}
