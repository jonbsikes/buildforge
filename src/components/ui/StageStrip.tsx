import { AlertTriangle } from "lucide-react";

export interface StageStripStage {
  name: string;
  /** "complete" | "in_progress" | "delayed" | "not_started" | "skipped" */
  status: string;
  date?: string | null;
  /** ISO start date for tooltip. */
  startDate?: string | null;
  /** ISO end date (actual or planned) for tooltip. */
  endDate?: string | null;
  /** Stable stage number/id used to build the detail-page deep link. */
  stageNumber?: number | null;
}

interface StageStripProps {
  /** Home Construction: exterior track. */
  extStages?: StageStripStage[];
  /** Home Construction: interior track. */
  intStages?: StageStripStage[];
  /** Land Development: single horizontal-work track. When set, EXT/INT are ignored. */
  workStages?: StageStripStage[];
  delayedCount?: number;
  /**
   * Optional base URL used to build a deep link when a segment is clicked.
   * Example: "/projects/abc123" → clicks go to `/projects/abc123?stage=<n>`.
   */
  projectHref?: string;
}

function fmtShortDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.max(1, Math.round((db - da) / 86400000));
}

function tooltipFor(s: StageStripStage): string {
  const parts: string[] = [s.name];
  const start = fmtShortDate(s.startDate);
  const end = fmtShortDate(s.endDate);
  if (start && end) parts.push(`${start} → ${end}`);
  else if (start) parts.push(`Starts ${start}`);
  else if (end) parts.push(`Due ${end}`);
  const d = daysBetween(s.startDate, s.endDate);
  if (d) parts.push(`${d} day${d !== 1 ? "s" : ""}`);
  const label =
    s.status === "complete" ? "Complete"
    : s.status === "in_progress" ? "In progress"
    : s.status === "delayed" ? "Delayed"
    : s.status === "skipped" ? "Skipped"
    : "Upcoming";
  parts.push(label);
  return parts.join(" · ");
}

// Pixel-bar segment per design_handoffs UI Review § 04:
// complete 14x5 green, current (in_progress) 22x6 brand-blue + glow,
// delayed 22x6 orange + glow, upcoming 14x5 grey, skipped hidden.
function Segment({ stage, href }: { stage: StageStripStage; href?: string }) {
  if (stage.status === "skipped") return null;

  const isCurrent = stage.status === "in_progress" || stage.status === "delayed";
  const isComplete = stage.status === "complete";
  const isDelayed = stage.status === "delayed";

  const w = isCurrent ? 22 : 14;
  const h = isCurrent ? 6 : 5;
  const bg = isComplete
    ? "var(--status-complete)"
    : isDelayed
    ? "var(--status-delayed)"
    : isCurrent
    ? "var(--brand-blue)"
    : "#E5E7EB";
  const glow = isCurrent
    ? isDelayed
      ? "0 0 0 2px rgba(249,115,22,.18)"
      : "0 0 0 2px rgba(66,114,239,.18)"
    : undefined;

  const commonClass = "inline-block flex-shrink-0 rounded-[2px]";
  const commonStyle: React.CSSProperties = {
    width: w,
    height: h,
    backgroundColor: bg,
    boxShadow: glow,
  };
  const title = tooltipFor(stage);

  // Note: `href` is accepted for parity with the UI Review spec but rendered as
  // a native title tooltip only — the strip lives inside a card/link parent,
  // and nested anchors are invalid HTML. Click lands on the parent Link.
  void href;
  return (
    <span className={commonClass} style={commonStyle} title={title} aria-label={title} />
  );
}

function CurrentLabel({ stages }: { stages: StageStripStage[] }) {
  const current = stages.find((s) => s.status === "in_progress" || s.status === "delayed");
  const next = current ? null : stages.find((s) => s.status === "not_started");
  if (!current && !next) return null;
  if (current) {
    const isDelayed = current.status === "delayed";
    return (
      <span className="ml-2 whitespace-nowrap">
        <span className="text-[11px] font-semibold text-gray-900">{current.name}</span>
        {isDelayed && (
          <span className="ml-1 text-[10px] font-medium" style={{ color: "var(--status-delayed)" }}>
            · Delayed
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="ml-2 whitespace-nowrap text-[11px] text-gray-500">
      Next: <span className="font-medium text-gray-700">{next!.name}</span>
      {next!.date && <span className="text-gray-400"> · {next!.date}</span>}
    </span>
  );
}

function Track({ label, stages, projectHref }: { label: string; stages: StageStripStage[]; projectHref?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 w-10">
        {label}
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {stages.map((s, i) => {
          const href = projectHref && s.stageNumber != null ? `${projectHref}?stage=${s.stageNumber}` : undefined;
          return <Segment key={i} stage={s} href={href} />;
        })}
        <CurrentLabel stages={stages} />
      </div>
    </div>
  );
}

export default function StageStrip({
  extStages,
  intStages,
  workStages,
  delayedCount = 0,
  projectHref,
}: StageStripProps) {
  const isLandDev = workStages && workStages.length > 0;
  const hasHomeData = extStages && extStages.length > 0;
  if (!isLandDev && !hasHomeData) return null;

  return (
    <div className="text-xs space-y-1">
      {delayedCount > 0 && (
        <div className="flex items-center gap-1 mb-1">
          <AlertTriangle size={11} className="text-amber-500" />
          <span className="text-amber-600 font-semibold text-xs">
            {delayedCount} delayed
          </span>
        </div>
      )}
      {isLandDev ? (
        <Track label="WORK" stages={workStages!} projectHref={projectHref} />
      ) : (
        <>
          <Track label="EXT" stages={extStages!} projectHref={projectHref} />
          {intStages && intStages.length > 0 && <Track label="INT" stages={intStages} projectHref={projectHref} />}
        </>
      )}
    </div>
  );
}
