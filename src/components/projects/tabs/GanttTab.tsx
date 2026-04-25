"use client";

import { useState, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, Printer } from "lucide-react";

export interface GanttStage {
  id: string;
  stage_number: number;
  stage_name: string;
  track: string | null;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

interface Props {
  stages: GanttStage[];
  startDate: string | null;
  isHome: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LABEL_WIDTH  = 240; // px — sticky left column
const ROW_HEIGHT   = 28;  // px
const TRACK_HEADER = 36;  // px
const HEADER_H     = 40;  // px

const ZOOM_LEVELS = [
  { label: "Full"  },
  { label: "Month" },
  { label: "Week"  },
] as const;

type ZoomIndex = 0 | 1 | 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

function dayOffset(base: Date, dateStr: string): number {
  return Math.round((parseDate(dateStr).getTime() - base.getTime()) / 86400000);
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function barColor(status: string, isDelayed: boolean): string {
  if (isDelayed) return "bg-amber-400";
  switch (status) {
    case "complete":
    case "completed":
      return "bg-green-500";
    case "in_progress":
      return "bg-[#4272EF]";
    default:
      return "bg-gray-300";
  }
}

function getBarDates(stage: GanttStage): { barStart: string; barEnd: string } | null {
  const status = stage.status;
  if (status === "complete" || status === "completed") {
    if (stage.actual_start_date && stage.actual_end_date) {
      return { barStart: stage.actual_start_date, barEnd: stage.actual_end_date };
    }
  }
  if (status === "in_progress") {
    const start = stage.actual_start_date ?? stage.planned_start_date;
    const end   = stage.planned_end_date;
    if (start && end) return { barStart: start, barEnd: end };
  }
  if (stage.planned_start_date && stage.planned_end_date) {
    return { barStart: stage.planned_start_date, barEnd: stage.planned_end_date };
  }
  return null;
}

interface TrackGroup {
  label: string;
  stages: GanttStage[];
}

function buildGroups(stages: GanttStage[], isHome: boolean): TrackGroup[] {
  // Filter out skipped stages — they don't belong on the Gantt
  const active = stages.filter((s) => s.status !== "skipped");
  // Land Development: single horizontal-work track, no EXT/INT split.
  if (!isHome) return [{ label: "Horizontal Work", stages: active }];
  const exterior = active.filter((s) => s.track === "exterior");
  const interior = active.filter((s) => s.track === "interior");
  const groups: TrackGroup[] = [];
  if (exterior.length) groups.push({ label: "Exterior", stages: exterior });
  if (interior.length) groups.push({ label: "Interior", stages: interior });
  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GanttTab({ stages, startDate, isHome }: Props) {
  const [zoomIdx, setZoomIdx] = useState<ZoomIndex>(0);

  // outerRef is on the card border element — used to measure available width
  const outerRef = useRef<HTMLDivElement>(null);
  const [timelineAreaW, setTimelineAreaW] = useState(600);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = startDate ? parseDate(startDate) : today;

  // Total days span.
  // Home construction is ALWAYS exactly 152 days (days 1–152, offsets 0–151).
  // Any stage date beyond this range is a data error — the Gantt must not expand.
  // Land development uses the actual stage span so it can grow with the schedule.
  let totalDays: number;
  if (isHome) {
    totalDays = 152;
  } else {
    totalDays = 24 * 7;
    for (const s of stages) {
      const dates = getBarDates(s);
      if (dates) {
        const end = dayOffset(base, dates.barEnd);
        if (end + 1 > totalDays) totalDays = end + 1;
      }
    }
    totalDays = Math.max(totalDays, 30);
  }

  // Measure the timeline area width (card width minus sticky label column)
  // and update on every resize so bars scale correctly
  useEffect(() => {
    const node = outerRef.current;
    if (!node) return;
    const measure = () => {
      const w = Math.max(1, node.clientWidth - LABEL_WIDTH);
      setTimelineAreaW(w);
      const dw = w / totalDays;
      console.log("[GanttTab] containerWidth:", w, "pixelsPerDay (Full):", dw.toFixed(2));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    measure();
    return () => ro.disconnect();
  }, [totalDays]);

  // dayWidth: how many px represents one day
  // Full  → entire timeline area fits all days
  // Month → scale so 30 days fills the visible area (wider than Full → scrolls)
  // Week  → scale so 7 days fills the visible area
  const dayWidth =
    zoomIdx === 0 ? timelineAreaW / totalDays :
    zoomIdx === 1 ? timelineAreaW / 30 :
                   timelineAreaW / 7;

  // Minimum inner content width so horizontal scrollbar appears when needed
  const innerMinWidth = totalDays * dayWidth + LABEL_WIDTH;

  const groups      = buildGroups(stages, isHome);
  const todayOffset = dayOffset(base, today.toISOString().split("T")[0]);

  // Month header markers
  const monthMarkers: { label: string; xPx: number }[] = [];
  {
    let d = new Date(base);
    d.setDate(1);
    if (d < base) d.setMonth(d.getMonth() + 1);
    while (dayOffset(base, d.toISOString().split("T")[0]) < totalDays) {
      const off = dayOffset(base, d.toISOString().split("T")[0]);
      monthMarkers.push({ label: fmtMonthYear(d), xPx: off * dayWidth });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  }

  return (
    <div className="space-y-3 gantt-tab">
      {/* ---- Controls ---- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {ZOOM_LEVELS.map((z, i) => (
            <button
              key={z.label}
              onClick={() => setZoomIdx(i as ZoomIndex)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                zoomIdx === i
                  ? "bg-white text-[#4272EF] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {z.label}
            </button>
          ))}
          <button
            onClick={() => setZoomIdx(Math.max(0, zoomIdx - 1) as ZoomIndex)}
            className="p-1 text-gray-400 hover:text-gray-600"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => setZoomIdx(Math.min(2, zoomIdx + 1) as ZoomIndex)}
            className="p-1 text-gray-400 hover:text-gray-600"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-300 inline-block" />
            Not started
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#4272EF] inline-block" />
            In progress
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-500 inline-block" />
            Complete
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-400 inline-block" />
            Delayed
          </span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1 ml-2 px-2 py-1 border border-gray-200 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors print:hidden"
          >
            <Printer size={13} />
            PDF
          </button>
        </div>
      </div>

      {/* ---- Gantt grid ----
          Single scrollable container:
          - overflow-y-auto → vertical scroll (labels + bars move together)
          - overflow-x-auto → horizontal scroll (only bar area, label stays sticky)
          Left cells use sticky left:0 to stay visible during horizontal scroll.
          Header row uses sticky top:0 to stay visible during vertical scroll.
      ---- */}
      <div
        ref={outerRef}
        className="border border-gray-200 rounded-xl bg-white overflow-hidden"
      >
        <div
          className="overflow-x-auto overflow-y-auto"
          style={{ maxHeight: 600 }}
        >
          {/* Inner div sized to the full timeline width — triggers horizontal scroll in Month/Week zoom */}
          <div style={{ minWidth: innerMinWidth }}>

            {/* ---- Sticky header row ---- */}
            <div className="flex sticky top-0 z-20" style={{ height: HEADER_H }}>
              {/* Corner cell: sticky both top and left */}
              <div
                className="sticky left-0 z-30 bg-white border-r border-b border-gray-200 flex items-end pb-1 px-3 flex-shrink-0"
                style={{ width: LABEL_WIDTH }}
              >
                <span className="text-xs font-medium text-gray-400">Stage</span>
              </div>
              {/* Month labels */}
              <div className="flex-1 relative bg-white border-b border-gray-200">
                {monthMarkers.map((m) => (
                  <div
                    key={m.xPx}
                    className="absolute bottom-1 text-[10px] text-gray-400 whitespace-nowrap"
                    style={{ left: m.xPx + 4 }}
                  >
                    {m.label}
                  </div>
                ))}
                {monthMarkers.map((m) => (
                  <div
                    key={`line-${m.xPx}`}
                    className="absolute top-0 bottom-0 border-l border-gray-100"
                    style={{ left: m.xPx }}
                  />
                ))}
              </div>
            </div>

            {/* ---- Track groups ---- */}
            {groups.map((group) => (
              <div key={group.label}>

                {/* Track header row */}
                <div className="flex" style={{ height: TRACK_HEADER }}>
                  <div
                    className="sticky left-0 z-10 bg-gray-50 border-r border-b border-gray-200 flex items-center px-3 flex-shrink-0"
                    style={{ width: LABEL_WIDTH }}
                  >
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {group.label}
                    </span>
                  </div>
                  <div className="flex-1 bg-gray-50 border-b border-gray-200" />
                </div>

                {/* Stage rows */}
                {group.stages.map((stage) => {
                  const dates = getBarDates(stage);
                  const isDelayed =
                    stage.planned_end_date &&
                    parseDate(stage.planned_end_date) < today &&
                    stage.status !== "complete" &&
                    stage.status !== "completed";

                  return (
                    <div key={stage.id} className="flex" style={{ height: ROW_HEIGHT }}>
                      {/* Label cell — sticky left */}
                      <div
                        className="sticky left-0 z-10 bg-white border-r border-b border-gray-100 flex items-center px-3 flex-shrink-0"
                        style={{ width: LABEL_WIDTH }}
                      >
                        <span className="text-xs text-gray-400 w-6 flex-shrink-0 font-mono">
                          {stage.stage_number}
                        </span>
                        <span className="text-xs text-gray-700 truncate ml-1">
                          {stage.stage_name}
                        </span>
                      </div>

                      {/* Bar cell */}
                      <div
                        className="flex-1 relative border-b border-gray-100"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {/* Today marker */}
                        {todayOffset >= 0 && todayOffset <= totalDays && (
                          <div
                            className="absolute top-0 bottom-0 border-l-2 border-[#4272EF] opacity-40 z-10 pointer-events-none"
                            style={{ left: todayOffset * dayWidth }}
                          />
                        )}

                        {/* Bar */}
                        {dates && (() => {
                          const startOff = dayOffset(base, dates.barStart);
                          const endOff   = dayOffset(base, dates.barEnd);
                          const left  = startOff * dayWidth;
                          const width = Math.max((endOff - startOff + 1) * dayWidth, 4);
                          const color = barColor(stage.status, Boolean(isDelayed));
                          return (
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 rounded ${color} opacity-90`}
                              style={{ left, width, height: 16 }}
                              title={`${stage.stage_name}: ${dates.barStart} → ${dates.barEnd}`}
                            />
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .gantt-tab .print\\:hidden { display: none !important; }
          body > *:not(.gantt-print-target) { display: none; }
        }
      `}</style>
    </div>
  );
}
