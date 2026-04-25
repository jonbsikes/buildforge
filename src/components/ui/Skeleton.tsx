import type { CSSProperties } from "react";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
  /** Convenience: w/h string. */
  width?: string | number;
  height?: string | number;
};

/** Shimmering placeholder block. Per UI Review § 16 #85. */
export function Skeleton({ className = "", style, width, height }: SkeletonProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-[color:var(--surface-secondary)] ${className}`}
      style={{
        ...style,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
      }}
      aria-hidden
    >
      <div className="absolute inset-0 -translate-x-full animate-skeleton-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
};

export function TableSkeleton({ rows = 8, columns = 5, showHeader = true, className = "" }: TableSkeletonProps) {
  return (
    <div className={`bg-white border border-[color:var(--card-border)] rounded-[var(--card-radius)] overflow-hidden ${className}`}>
      {showHeader && (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-[color:var(--border-weak)]">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={`h-${i}`} className="h-3" width={i === 0 ? 96 : 64} />
          ))}
        </div>
      )}
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex items-center gap-4 px-4 py-3 border-b border-[color:var(--border-hair)] last:border-b-0"
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={`c-${r}-${c}`} className="h-3.5" width={c === 0 ? 140 : 80} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

type ListSkeletonProps = {
  rows?: number;
  className?: string;
};

export function ListSkeleton({ rows = 6, className = "" }: ListSkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-[color:var(--card-border)] rounded-[var(--card-radius)] p-4 flex items-center gap-3"
        >
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5" width="40%" />
            <Skeleton className="h-3" width="65%" />
          </div>
          <Skeleton className="h-3.5" width={72} />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
