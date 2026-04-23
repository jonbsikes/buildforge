import Link from "next/link";
import { HardHat, TreePine, ClipboardList, AlertTriangle } from "lucide-react";
import ProgressRing from "@/components/ui/ProgressRing";
import StageStrip, { type StageStripStage } from "@/components/ui/StageStrip";
import type { StatusKind } from "@/components/ui/StatusBadge";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysAgo(d: string) {
  return Math.floor(
    (Date.now() - new Date(d + "T00:00:00").getTime()) / 86400000,
  );
}

function fmtShortCurrency(n: number, signed = false): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : signed ? "+" : "";
  const display =
    abs >= 1_000_000
      ? `$${(abs / 1_000_000).toFixed(1)}M`
      : abs >= 1_000
        ? `$${(abs / 1_000).toFixed(0)}k`
        : `$${abs.toFixed(0)}`;
  return `${sign}${display}`;
}

export interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    project_type: string;
    address: string | null;
    start_date: string | null;
    subdivision: string | null;
    block: string | null;
    lot: string | null;
    plan: string | null;
    home_size_sf: number | null;
    size_acres: number | null;
    number_of_lots: number | null;
  };
  currentStage: {
    stage_name: string;
    status: string;
    planned_end_date: string | null;
  } | null;
  nextStage: {
    stage_name: string;
    planned_start_date: string | null;
  } | null;
  progress: number;
  budget: number;
  spent: number;
  todoCount: number;
  extStages?: StageStripStage[];
  intStages?: StageStripStage[];
  delayedCount?: number;
}

function accentForState(opts: {
  isOverBudget: boolean;
  delayedCount: number;
  progress: number;
  isActive: boolean;
}): { color: string; kind: StatusKind } {
  if (opts.isOverBudget) return { color: "var(--status-over)", kind: "over" };
  if (opts.delayedCount > 0) return { color: "var(--status-delayed)", kind: "delayed" };
  if (opts.progress >= 100) return { color: "var(--status-complete)", kind: "complete" };
  if (opts.isActive) return { color: "var(--status-active)", kind: "active" };
  return { color: "var(--status-planned)", kind: "planned" };
}

export default function ProjectCard({
  project,
  currentStage,
  progress,
  budget,
  spent,
  todoCount,
  extStages = [],
  intStages = [],
  delayedCount = 0,
}: ProjectCardProps) {
  const daysUnder = project.start_date ? daysAgo(project.start_date) : null;
  const isHome = project.project_type === "home_construction";
  const isActive = (daysUnder ?? -1) >= 0;

  const isOverBudget = budget > 0 && spent > budget;
  const delta = spent - budget;
  const accent = accentForState({
    isOverBudget,
    delayedCount,
    progress,
    isActive,
  });

  const subtitle = isHome
    ? [
        project.block && project.lot
          ? `Block ${project.block}, Lot ${project.lot}`
          : null,
        project.plan,
        project.home_size_sf
          ? `${project.home_size_sf.toLocaleString()} SF`
          : null,
      ]
        .filter(Boolean)
        .join(" \u00b7 ") || (project.address ?? "")
    : [
        project.size_acres ? `${project.size_acres} acres` : null,
        project.number_of_lots ? `${project.number_of_lots} lots` : null,
      ]
        .filter(Boolean)
        .join(" \u00b7 ") || (project.address ?? "");

  const hasTertiary = delayedCount > 0 || isOverBudget;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-[color:var(--card-bg)] rounded-[var(--card-radius)] border border-[color:var(--card-border)] p-[var(--card-padding)] hover:shadow-md hover:-translate-y-0.5 transition-all group"
      style={{ borderLeft: `3px solid ${accent.color}` }}
    >
      {/* Header: subdivision label + name + progress ring */}
      <div className="flex items-start justify-between mb-2 gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {isHome ? (
              <HardHat
                size={13}
                className="shrink-0"
                style={{ color: "var(--brand-blue)" }}
              />
            ) : (
              <TreePine
                size={13}
                className="shrink-0"
                style={{ color: "var(--status-complete)" }}
              />
            )}
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">
              {project.subdivision || (isHome ? "Home" : "Land Dev")}
            </span>
          </div>
          <h3 className="text-sm font-bold text-gray-900 truncate group-hover:text-[color:var(--brand-blue)] transition-colors">
            {project.name}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-400 truncate">{subtitle}</p>
          )}
        </div>
        <ProgressRing progress={progress} size={48} strokeWidth={4} />
      </div>

      {/* Current stage chip */}
      {currentStage && (
        <div className="flex items-center gap-1.5 mb-3 text-[11px]">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: accent.color }}
          />
          <span className="text-gray-600 truncate">
            <span className="font-medium">{currentStage.stage_name}</span>
            {currentStage.planned_end_date && (
              <span className="text-gray-400"> · due {fmtDate(currentStage.planned_end_date)}</span>
            )}
          </span>
        </div>
      )}

      {/* Stage strip — the two-track EXT/INT view */}
      {extStages.length > 0 && (
        <div className="mb-3 py-2 px-2.5 bg-gray-50 rounded-lg">
          <StageStrip
            extStages={extStages}
            intStages={intStages}
            delayedCount={delayedCount}
          />
        </div>
      )}

      {/* Metrics row: budget actual / target · delta */}
      {budget > 0 ? (
        <div className="flex items-baseline justify-between text-[11px] tabular-nums mb-2">
          <div>
            <span className="text-gray-900 font-semibold">
              {fmtShortCurrency(spent)}
            </span>
            <span className="text-gray-400"> / {fmtShortCurrency(budget)}</span>
          </div>
          {Math.abs(delta) > 0.5 && (
            <span
              className="font-medium"
              style={{
                color: delta > 0 ? "var(--status-over)" : "var(--status-complete)",
              }}
            >
              {fmtShortCurrency(delta, true)} {delta > 0 ? "over" : "under"}
            </span>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-300 py-1">No budget set</div>
      )}

      {/* Footer: days + todos */}
      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-100">
        <span className="text-xs text-gray-400">
          {daysUnder !== null && daysUnder >= 0
            ? `${daysUnder} days`
            : "Pre-construction"}
        </span>
        {todoCount > 0 && (
          <span
            className="text-xs font-medium flex items-center gap-1"
            style={{ color: "var(--status-warning)" }}
          >
            <ClipboardList size={11} />
            {todoCount} to-do{todoCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Tertiary row — conditional */}
      {hasTertiary && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[color:var(--border-hair)]">
          {delayedCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border"
              style={{
                color: "var(--status-delayed)",
                borderColor: "var(--status-delayed)",
              }}
            >
              <AlertTriangle size={10} />
              {delayedCount} delayed
            </span>
          )}
          {isOverBudget && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border"
              style={{
                color: "var(--status-over)",
                borderColor: "var(--status-over)",
              }}
            >
              Over budget
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
