import Link from "next/link";
import { HardHat, TreePine, ClipboardList } from "lucide-react";
import ProgressRing from "@/components/ui/ProgressRing";
import BudgetBar from "@/components/ui/BudgetBar";
import StageStrip, { type StageStripStage } from "@/components/ui/StageStrip";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function daysAgo(d: string) {
  return Math.floor(
    (Date.now() - new Date(d + "T00:00:00").getTime()) / 86400000
  );
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

export default function ProjectCard({
  project,
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

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group"
    >
      {/* Header: name + progress ring */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0 mr-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            {isHome ? (
              <HardHat size={13} className="text-[#4272EF] shrink-0" />
            ) : (
              <TreePine size={13} className="text-emerald-500 shrink-0" />
            )}
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">
              {project.subdivision || (isHome ? "Home" : "Land Dev")}
            </span>
          </div>
          <h3 className="text-sm font-bold text-gray-900 truncate group-hover:text-[#4272EF] transition-colors">
            {project.name}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-400 truncate">{subtitle}</p>
          )}
        </div>
        <ProgressRing progress={progress} size={48} strokeWidth={4} />
      </div>

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

      {/* Budget bar */}
      {budget > 0 ? (
        <BudgetBar spent={spent} budget={budget} />
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
          <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <ClipboardList size={11} />
            {todoCount} to-do{todoCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </Link>
  );
}
