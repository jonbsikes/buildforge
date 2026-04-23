import Link from "next/link";
import type { ReactNode } from "react";
import type { StatusKind } from "@/components/ui/StatusBadge";

type AttentionKind = "over" | "delayed" | "warning";

const TINT: Record<AttentionKind, string> = {
  over: "var(--tint-over)",
  delayed: "var(--tint-delayed)",
  warning: "var(--tint-warning)",
};

const ACCENT: Record<AttentionKind, string> = {
  over: "var(--status-over)",
  delayed: "var(--status-delayed)",
  warning: "var(--status-warning)",
};

const STATUS_KIND: Record<AttentionKind, StatusKind> = {
  over: "over",
  delayed: "delayed",
  warning: "warning",
};

export type { AttentionKind };
export const attentionStatusKind = STATUS_KIND;

export interface AttentionCardProps {
  kind: AttentionKind;
  title: string;
  subtitle: string;
  href: string;
  primaryAction?: ReactNode;
}

export default function AttentionCard({
  kind,
  title,
  subtitle,
  href,
  primaryAction,
}: AttentionCardProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0"
      style={{
        backgroundColor: TINT[kind],
        borderLeft: `3px solid ${ACCENT[kind]}`,
        borderBottomColor: "var(--border-hair)",
      }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: ACCENT[kind] }}
        aria-hidden
      />
      <Link href={href} className="flex-1 min-w-0 group">
        <p className="text-sm font-semibold text-gray-900 truncate group-hover:underline">
          {title}
        </p>
        <p className="text-xs text-gray-600 truncate">{subtitle}</p>
      </Link>
      <div className="flex items-center gap-2 flex-shrink-0">
        {primaryAction}
        <Link
          href={href}
          className="text-[11px] font-medium"
          style={{ color: "var(--brand-blue)" }}
        >
          Open →
        </Link>
      </div>
    </div>
  );
}
