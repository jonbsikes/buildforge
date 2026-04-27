"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import type { TreeNode, WorstState } from "@/lib/projects/tree";
import type { StatusKind } from "@/components/ui/StatusBadge";

const ACCENT_VAR: Record<WorstState, string | undefined> = {
  ok: undefined,
  delayed: "var(--status-delayed)",
  "over-budget": "var(--status-over)",
  complete: "var(--status-complete)",
};

const TINT_VAR: Record<WorstState, string | undefined> = {
  ok: undefined,
  delayed: "var(--tint-delayed)",
  "over-budget": "var(--tint-over)",
  complete: undefined,
};

const DOT_VAR: Record<StatusKind, string> = {
  complete: "var(--status-complete)",
  active: "var(--status-active)",
  delayed: "var(--status-delayed)",
  warning: "var(--status-warning)",
  over: "var(--status-over)",
  planned: "var(--status-planned)",
  neutral: "var(--status-neutral)",
};

function formatDelta(delta: number): string {
  if (Math.abs(delta) < 1) return "—";
  const sign = delta >= 0 ? "+" : "−";
  const abs = Math.abs(delta);
  const display =
    abs >= 1_000_000
      ? `${(abs / 1_000_000).toFixed(1)}M`
      : abs >= 1_000
        ? `${(abs / 1_000).toFixed(0)}k`
        : abs.toFixed(0);
  return `${sign}$${display}`;
}

export interface TreeRowProps {
  node: TreeNode;
  expanded: boolean;
  onToggle: () => void;
}

export default function TreeRow({ node, expanded, onToggle }: TreeRowProps) {
  const router = useRouter();
  const isOrg = node.kind === "org";
  const isSectionHeader =
    node.depth === 0 && (node.kind === "home-construction-branch" || node.kind === "land-dev-branch");
  const isLot = node.kind === "lot-home" || node.kind === "lot-forsale";
  const hasChildren = node.children.length > 0;

  const rowHeight = isSectionHeader ? 44 : isLot ? 44 : 52;
  const indent = node.depth * 20 + 14;

  const accent = ACCENT_VAR[node.rollup.worstState];
  const tint = TINT_VAR[node.rollup.worstState];

  const baseStyle: React.CSSProperties = isOrg
    ? { backgroundColor: "#0F172A", color: "white", minHeight: rowHeight, paddingLeft: indent }
    : isSectionHeader
      ? {
          minHeight: rowHeight,
          paddingLeft: indent,
          backgroundColor: "#F8FAFC",
          borderLeft: "3px solid transparent",
        }
      : {
          minHeight: rowHeight,
          paddingLeft: indent,
          backgroundColor: tint,
          borderLeft: accent ? `3px solid ${accent}` : "3px solid transparent",
        };

  const nameSize = isSectionHeader
    ? "text-[11px] uppercase tracking-wider"
    : isLot
      ? "text-[12px]"
      : node.kind === "phase"
        ? "text-[13px]"
        : "text-[14px]";
  const subColor = isOrg ? "text-slate-400" : "text-gray-400";

  /**
   * Primary click semantics:
   * - If node has href → click anywhere on the row navigates to it (caret still toggles).
   * - Else if node has children → click toggles expand.
   * - Else → click is inert.
   * This matches standard tree-with-detail-pages UX and fixes rows that previously
   * required hovering to reveal the "Open →" link.
   */
  const handleRowClick = () => {
    if (node.href) router.push(node.href);
    else if (hasChildren) onToggle();
  };
  const rowInteractive = !!node.href || hasChildren;

  const deltaColor =
    node.rollup.budgetDelta > 0
      ? "var(--status-over)"
      : node.rollup.budgetDelta < 0
        ? "var(--status-complete)"
        : isOrg
          ? "#94A3B8"
          : "#64748B";

  return (
    <div
      className={`group flex items-center gap-2 pr-3 border-b border-[color:var(--border-hair)] transition-colors ${
        rowInteractive ? "cursor-pointer hover:bg-gray-50/60" : ""
      }`}
      style={baseStyle}
      onClick={rowInteractive ? handleRowClick : undefined}
    >
      {/* Caret */}
      <div className="w-[22px] flex-shrink-0 flex items-center justify-center">
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={isSectionHeader ? "text-gray-600 hover:text-gray-900" : "text-gray-500 hover:text-gray-700"}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : isLot && node.lot ? (
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: DOT_VAR[node.lot.statusDot] }}
          />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--border-strong)]" />
        )}
      </div>

      {/* Name + subtitle */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-2 min-w-0">
          <span
            className={`${nameSize} ${isSectionHeader ? "font-bold text-gray-500" : "font-semibold"} truncate`}
          >
            {node.name}
          </span>
          {(node.subtitle || (isLot && node.lot?.currentStage)) && (
            <div className="flex items-baseline gap-2 min-w-0">
              {node.subtitle && (
                <span className={`text-[11px] ${subColor} truncate`}>{node.subtitle}</span>
              )}
              {isLot && node.lot?.currentStage && (
                <span className={`text-[11px] ${subColor} truncate hidden md:inline`}>
                  · {node.lot.currentStage}
                </span>
              )}
            </div>
          )}
        </div>
        {node.kind === "subdivision" && node.dotScan && node.dotScan.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {node.dotScan.slice(0, 40).map((d) => (
              <span
                key={d.id}
                title={`${d.label} — ${d.statusDot}`}
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: DOT_VAR[d.statusDot] }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rollup columns (parent rows) */}
      {!isLot && !isSectionHeader && (
        <div className="hidden md:flex items-center">
          <div
            className={`w-[90px] text-right text-xs tabular-nums ${isOrg ? "text-white" : "text-gray-700"}`}
            title="Active"
          >
            {node.rollup.activeCount > 0 ? `${node.rollup.activeCount} active` : "—"}
          </div>
          <div
            className="w-[90px] text-right text-xs tabular-nums font-medium"
            title="At risk"
            style={{
              color:
                node.rollup.atRiskCount > 0
                  ? "var(--status-over)"
                  : isOrg
                    ? "#94A3B8"
                    : "#64748B",
            }}
          >
            {node.rollup.atRiskCount > 0 ? `${node.rollup.atRiskCount} at risk` : "—"}
          </div>
          <div
            className={`w-[80px] text-right text-xs tabular-nums ${isOrg ? "text-white" : "text-gray-700"}`}
            title="Progress"
          >
            {node.rollup.progressPct > 0 ? `${node.rollup.progressPct}%` : "—"}
          </div>
          <div
            className="w-[90px] text-right text-xs tabular-nums font-medium"
            title="Budget delta"
            style={{ color: deltaColor }}
          >
            {formatDelta(node.rollup.budgetDelta)}
          </div>
        </div>
      )}

      {/* Section header: show count + progress on the right */}
      {isSectionHeader && (
        <div className="hidden md:flex items-center">
          <div className="w-[90px] text-right text-xs tabular-nums text-gray-600">
            {node.rollup.activeCount > 0 ? `${node.rollup.activeCount} active` : "—"}
          </div>
          <div
            className="w-[90px] text-right text-xs tabular-nums font-medium"
            style={{
              color: node.rollup.atRiskCount > 0 ? "var(--status-over)" : "#94A3B8",
            }}
          >
            {node.rollup.atRiskCount > 0 ? `${node.rollup.atRiskCount} at risk` : "—"}
          </div>
          <div className="w-[80px] text-right text-xs tabular-nums text-gray-600">
            {node.rollup.progressPct > 0 ? `${node.rollup.progressPct}%` : "—"}
          </div>
          <div
            className="w-[90px] text-right text-xs tabular-nums font-medium"
            style={{ color: deltaColor }}
          >
            {formatDelta(node.rollup.budgetDelta)}
          </div>
        </div>
      )}

      {/* Lot row rollup */}
      {isLot && (
        <div className="hidden md:flex items-center">
          <div className="w-[90px] text-right text-xs tabular-nums text-gray-700">
            {node.rollup.progressPct > 0 ? `${node.rollup.progressPct}%` : "—"}
          </div>
          <div
            className="w-[90px] text-right text-xs tabular-nums font-medium"
            style={{ color: deltaColor }}
          >
            {formatDelta(node.rollup.budgetDelta)}
          </div>
        </div>
      )}

      {/* Action link — redundant when the row itself navigates, but kept as a
         visible affordance on hover. */}
      <div className="w-[60px] flex-shrink-0 text-right">
        {node.href ? (
          <Link
            href={node.href}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: isOrg ? "#94A3B8" : "var(--brand-blue)" }}
          >
            Open <ArrowRight size={11} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
