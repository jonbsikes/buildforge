import Link from "next/link";
import {
  ChevronRight,
  Clock,
  HardHat,
  TreePine,
  CheckCircle2,
  Circle,
  AlertCircle,
  ClipboardList,
} from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

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

const STAGE_STATUS_ICON: Record<string, React.ReactNode> = {
  complete: <CheckCircle2 size={14} className="text-green-500" />,
  in_progress: <Circle size={14} className="text-[#4272EF] fill-[#4272EF]" />,
  delayed: <AlertCircle size={14} className="text-amber-500" />,
  not_started: <Circle size={14} className="text-gray-300" />,
};

const PROJECT_TYPE_ICON: Record<string, React.ReactNode> = {
  home_construction: <HardHat size={16} className="text-[#4272EF]" />,
  land_development: <TreePine size={16} className="text-emerald-600" />,
};

export interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    project_type: string;
    address: string | null;
    start_date: string | null;
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
}

export default function ProjectCard({
  project,
  currentStage,
  nextStage,
  progress,
  budget,
  spent,
  todoCount,
}: ProjectCardProps) {
  const daysUnderConstruction = project.start_date
    ? daysAgo(project.start_date)
    : null;
  const isOver = budget > 0 && spent > budget;

  const subtitle =
    project.project_type === "home_construction"
      ? [
          project.block && project.lot
            ? `Blk ${project.block} / Lot ${project.lot}`
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
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-[#4272EF]/30 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {PROJECT_TYPE_ICON[project.project_type]}
            <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#4272EF] transition-colors">
              {project.name}
            </h3>
          </div>
          {subtitle && (
            <p className="text-xs text-gray-400 truncate">{subtitle}</p>
          )}
        </div>
        {daysUnderConstruction !== null && daysUnderConstruction >= 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0 ml-2">
            <Clock size={12} />
            <span>Day {daysUnderConstruction}</span>
          </div>
        )}
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">Stage Progress</span>
          <span className="text-xs font-medium text-gray-700">{progress}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#4272EF] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {currentStage && (
        <div className="flex items-center gap-2 mb-2">
          {STAGE_STATUS_ICON[currentStage.status] ?? STAGE_STATUS_ICON.not_started}
          <span className="text-xs font-medium text-gray-700 truncate">
            {currentStage.stage_name}
          </span>
          {currentStage.planned_end_date && (
            <span className="text-xs text-gray-400 ml-auto shrink-0">
              ends {fmtDate(currentStage.planned_end_date)}
            </span>
          )}
        </div>
      )}

      {nextStage && (
        <div className="flex items-center gap-2 mb-3 opacity-60">
          <ChevronRight size={14} className="text-gray-300" />
          <span className="text-xs text-gray-500 truncate">
            Next: {nextStage.stage_name}
          </span>
          {nextStage.planned_start_date && (
            <span className="text-xs text-gray-400 ml-auto shrink-0">
              {fmtDate(nextStage.planned_start_date)}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        {budget > 0 ? (
          <div className="text-xs">
            <span className="text-gray-500">
              {fmt(spent)} / {fmt(budget)}
            </span>
            {isOver && (
              <span className="ml-1 text-red-500 font-medium">Over</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-300">No budget set</span>
        )}
        {todoCount > 0 && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <ClipboardList size={12} />
            {todoCount} to-do{todoCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </Link>
  );
}
