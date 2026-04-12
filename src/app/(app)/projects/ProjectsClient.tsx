"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, ChevronDown, ChevronRight, AlertTriangle, ArrowRight } from "lucide-react";

type Phase = {
  phase_number: number | null;
  name: string | null;
  status: string;
  number_of_lots: number | null;
  lots_sold: number;
};

type DelayedStage = {
  stage_name: string;
  planned_end_date: string;
};

type NextStage = {
  stage_name: string;
  planned_start_date: string | null;
};

type TrackSummary = {
  lastCompleted: string | null;
  inProgress: string | null;
  next: NextStage | null;
};

type Project = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  project_type: string;
  subdivision: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  block: string | null;
  lot: string | null;
  lot_size_acres: number | null;
  plan: string | null;
  home_size_sf: number | null;
  size_acres: number | null;
  number_of_lots: number | null;
  number_of_phases: number | null;
  lastStageCompleted: string | null;
  delayedStages: DelayedStage[];
  nextStage: NextStage | null;
  trackStages: { exterior: TrackSummary; interior: TrackSummary };
  phases: Phase[];
};

const STATUS_COLOR: Record<string, string> = {
  planning:         "bg-gray-100 text-gray-600",
  active:           "bg-green-100 text-green-700",
  on_hold:          "bg-amber-100 text-amber-700",
  completed:        "bg-blue-100 text-blue-700",
  cancelled:        "bg-red-100 text-red-600",
  pre_construction: "bg-purple-100 text-purple-700",
};

const PHASE_STATUS_COLOR: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-500",
  in_progress: "bg-blue-100 text-blue-700",
  complete:    "bg-green-100 text-green-700",
};

function formatDate(d: string | null) {
  if (!d) return null;
  const [y, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}/${y}`;
}

function daysUnderConstruction(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

// Custom house icon
function HouseIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

// Custom land/sunset icon
function LandIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12 Q5 7 12 7 Q19 7 19 12" />
      <line x1="12" y1="4" x2="12" y2="2" />
      <line x1="7" y1="5.5" x2="5.5" y2="4" />
      <line x1="17" y1="5.5" x2="18.5" y2="4" />
      <line x1="4" y1="10" x2="2" y2="10" />
      <line x1="20" y1="10" x2="22" y2="10" />
      <line x1="2" y1="14" x2="22" y2="14" />
      <line x1="19" y1="14" x2="19" y2="19" />
      <polygon points="19,9 16,14 22,14" />
      <line x1="2" y1="19" x2="22" y2="19" />
    </svg>
  );
}

function TrackLine({ label, track }: { label: string; track: TrackSummary }) {
  const hasContent = track.lastCompleted || track.inProgress || track.next;
  if (!hasContent) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-[10px] font-semibold text-gray-400 uppercase w-10 shrink-0">{label}</span>
      {track.lastCompleted && (
        <span className="text-xs text-green-600 font-medium">✓ {track.lastCompleted}</span>
      )}
      {track.inProgress && (
        <span className="text-xs text-[#4272EF] font-medium">● {track.inProgress}</span>
      )}
      {track.next && (
        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
          <ArrowRight size={10} className="shrink-0 text-gray-400" />
          {track.next.stage_name}
          {track.next.planned_start_date && (
            <span className="text-gray-400">({formatDate(track.next.planned_start_date)})</span>
          )}
        </span>
      )}
    </div>
  );
}

function WhatsNext({ project }: { project: Project }) {
  const hasDelayed = project.delayedStages.length > 0;
  const { exterior, interior } = project.trackStages;
  const hasTrackData = exterior.lastCompleted || exterior.inProgress || exterior.next ||
    interior.lastCompleted || interior.inProgress || interior.next;

  if (!hasDelayed && !hasTrackData) return null;

  return (
    <div className="mt-1 space-y-0.5">
      {hasDelayed && (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
            <AlertTriangle size={11} className="shrink-0" />
            {project.delayedStages.length === 1
              ? project.delayedStages[0].stage_name
              : `${project.delayedStages.length} delayed`}
          </span>
        </div>
      )}
      <TrackLine label="Ext" track={exterior} />
      <TrackLine label="Int" track={interior} />
    </div>
  );
}

function HomeTile({ project }: { project: Project }) {
  const days = project.start_date ? daysUnderConstruction(project.start_date) : 0;
  const blockLot = [project.block && `Block ${project.block}`, project.lot && `Lot ${project.lot}`]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/projects/${project.id}`}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-sm font-semibold text-gray-900">{project.name}</span>
          {project.address && (
            <span className="text-xs text-gray-400 truncate">{project.address}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {blockLot && <span className="text-xs text-gray-500">{blockLot}</span>}
          {project.plan && <span className="text-xs text-gray-500">Plan: {project.plan}</span>}
          {project.home_size_sf && (
            <span className="text-xs text-gray-400">{project.home_size_sf.toLocaleString()} SF</span>
          )}
          {project.lot_size_acres && (
            <span className="text-xs text-gray-400">{project.lot_size_acres} ac lot</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {project.start_date && (
            <span className="text-xs text-gray-400">Started {formatDate(project.start_date)}</span>
          )}
          {project.end_date && (
            <span className="text-xs text-gray-400">→ Est. close {formatDate(project.end_date)}</span>
          )}
          {days > 0 && (
            <span className="text-xs font-medium text-[#4272EF]">{days}d under construction</span>
          )}
        </div>
        <WhatsNext project={project} />
      </div>
      <span
        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[project.status] ?? "bg-gray-100 text-gray-600"}`}
      >
        {project.status.replace(/_/g, " ")}
      </span>
    </Link>
  );
}

function SubdivisionGroup({
  subdivision,
  projects,
}: {
  subdivision: string;
  projects: Project[];
}) {
  const [open, setOpen] = useState(true);
  const activeCount = projects.filter((p) => p.status === "active").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown size={14} className="text-gray-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-500" />
          )}
          <span className="text-sm font-semibold text-gray-700">{subdivision}</span>
          <span className="text-xs text-gray-400">
            {projects.length} home{projects.length !== 1 ? "s" : ""}
            {activeCount > 0 ? `, ${activeCount} active` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {projects.map((p) => (
            <span
              key={p.id}
              title={`${p.address ?? p.name} — ${p.status}`}
              className={`w-2 h-2 rounded-full ${
                p.status === "active"
                  ? "bg-green-400"
                  : p.status === "completed"
                  ? "bg-blue-400"
                  : "bg-gray-300"
              }`}
            />
          ))}
        </div>
      </button>

      {open && (
        <div className="divide-y divide-gray-50">
          {projects.map((p) => (
            <HomeTile key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function LandTile({ project }: { project: Project }) {
  const days = project.start_date ? daysUnderConstruction(project.start_date) : 0;
  const hasPhases = project.phases.length > 0;
  const totalLots =
    project.phases.reduce((s, ph) => s + (ph.number_of_lots ?? 0), 0) ||
    project.number_of_lots ||
    0;
  const totalSold = project.phases.reduce((s, ph) => s + ph.lots_sold, 0);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-sm font-semibold text-gray-900">{project.name}</span>
          {project.address && (
            <span className="text-xs text-gray-400 truncate">{project.address}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {project.size_acres && (
            <span className="text-xs text-gray-500">{project.size_acres} acres</span>
          )}
          {totalLots > 0 && <span className="text-xs text-gray-500">{totalLots} lots</span>}
          {totalSold > 0 && (
            <span className="text-xs text-green-600 font-medium">
              {totalSold} sold · {totalLots - totalSold} remaining
            </span>
          )}
        </div>

        {hasPhases && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {project.phases.map((ph) => (
              <span
                key={ph.phase_number}
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${PHASE_STATUS_COLOR[ph.status] ?? "bg-gray-100 text-gray-500"}`}
              >
                Ph {ph.phase_number}
                {ph.number_of_lots ? ` · ${ph.number_of_lots} lots` : ""}
                {ph.lots_sold > 0 ? ` · ${ph.lots_sold} sold` : ""}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
          {project.start_date && (
            <span className="text-xs text-gray-400">Started {formatDate(project.start_date)}</span>
          )}
          {project.end_date && (
            <span className="text-xs text-gray-400">→ Est. close {formatDate(project.end_date)}</span>
          )}
          {days > 0 && (
            <span className="text-xs font-medium text-[#4272EF]">{days}d active</span>
          )}
        </div>
        <WhatsNext project={project} />
      </div>

      <span
        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[project.status] ?? "bg-gray-100 text-gray-600"}`}
      >
        {project.status.replace(/_/g, " ")}
      </span>
    </Link>
  );
}

export default function ProjectsClient({ projects }: { projects: Project[] }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");

  function matches(p: Project) {
    if (filterStatus && p.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.address?.toLowerCase().includes(q) ?? false) ||
        (p.subdivision?.toLowerCase().includes(q) ?? false) ||
        (p.plan?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  }

  const homeProjects = useMemo(
    () =>
      projects
        .filter((p) => p.project_type === "home_construction")
        .filter(matches),
    [projects, search, filterStatus]
  );

  const landProjects = useMemo(
    () =>
      projects
        .filter((p) => p.project_type === "land_development")
        .filter(matches),
    [projects, search, filterStatus]
  );

  const subdivisions = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of homeProjects) {
      const key = p.subdivision ?? "(No Subdivision)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [homeProjects]);

  const showHome = !filterType || filterType === "home";
  const showLand = !filterType || filterType === "land";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, address, subdivision, plan..."
            className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="planning">Planning</option>
          <option value="pre_construction">Pre-Construction</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">All Types</option>
          <option value="home">Home Construction</option>
          <option value="land">Land Development</option>
        </select>
        {(search || filterStatus || filterType) && (
          <button
            onClick={() => {
              setSearch("");
              setFilterStatus("");
              setFilterType("");
            }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 border border-gray-200 rounded-lg"
          >
            Clear
          </button>
        )}
      </div>

      {showHome && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HouseIcon size={16} className="text-[#4272EF]" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Home Construction
            </h2>
            <span className="text-xs text-gray-400">({homeProjects.length})</span>
          </div>

          {homeProjects.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
              No home construction projects match.
            </div>
          ) : (
            <div className="space-y-3">
              {subdivisions.map(([subdivision, projs]) => (
                <SubdivisionGroup
                  key={subdivision}
                  subdivision={subdivision}
                  projects={projs}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {showLand && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <LandIcon size={16} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Land Development
            </h2>
            <span className="text-xs text-gray-400">({landProjects.length})</span>
          </div>

          {landProjects.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
              No land development projects match.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {landProjects.map((p) => (
                <LandTile key={p.id} project={p} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
