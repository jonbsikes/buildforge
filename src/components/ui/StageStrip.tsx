import { AlertTriangle } from "lucide-react";

export interface StageStripStage {
  name: string;
  status: string;
  date?: string | null;
}

interface StageStripProps {
  extStages: StageStripStage[];
  intStages: StageStripStage[];
  delayedCount?: number;
}

function StageItem({
  stage,
  isLast,
}: {
  stage: StageStripStage;
  isLast: boolean;
}) {
  const colorClass =
    stage.status === "complete"
      ? "text-green-600"
      : stage.status === "in_progress"
      ? "text-[#4272EF]"
      : stage.status === "delayed"
      ? "text-red-600"
      : "text-gray-400";

  const icon =
    stage.status === "complete"
      ? "\u2713"
      : stage.status === "in_progress"
      ? "\u25CF"
      : "\u203A";

  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      <span className={`text-xs font-bold ${colorClass}`}>{icon}</span>
      <span
        className={`text-xs whitespace-nowrap ${colorClass} ${
          stage.status === "in_progress" ? "font-semibold" : ""
        }`}
      >
        {stage.name}
      </span>
      {stage.date && (
        <span className="text-[10px] text-gray-300 ml-0.5">
          ({stage.date})
        </span>
      )}
      {!isLast && <span className="text-gray-300 mx-0.5">&rsaquo;</span>}
    </span>
  );
}

export default function StageStrip({
  extStages,
  intStages,
  delayedCount = 0,
}: StageStripProps) {
  if (!extStages || extStages.length === 0) return null;

  return (
    <div className="text-xs">
      {delayedCount > 0 && (
        <div className="flex items-center gap-1 mb-1">
          <AlertTriangle size={11} className="text-amber-500" />
          <span className="text-amber-600 font-semibold text-xs">
            {delayedCount} delayed
          </span>
        </div>
      )}
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 w-6">
          EXT
        </span>
        <div className="flex items-center gap-0 flex-wrap">
          {extStages.map((s, i) => (
            <StageItem key={i} stage={s} isLast={i === extStages.length - 1} />
          ))}
        </div>
      </div>
      {intStages && intStages.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 w-6">
            INT
          </span>
          <div className="flex items-center gap-0 flex-wrap">
            {intStages.map((s, i) => (
              <StageItem
                key={i}
                stage={s}
                isLast={i === intStages.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
