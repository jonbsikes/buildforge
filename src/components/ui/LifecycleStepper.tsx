import type { ReactNode } from "react";
import { Check } from "lucide-react";

export type LifecycleStep = {
  id: string;
  label: string;
  /** Optional caption rendered under the label (e.g. a date). */
  caption?: ReactNode;
};

type LifecycleStepperProps = {
  steps: LifecycleStep[];
  /** Currently active step id. Steps before it render as completed. */
  current: string;
  /** Visually mark the flow as terminated (e.g. "void"); current step gets the ended treatment. */
  ended?: boolean;
  className?: string;
};

/**
 * Horizontal stepper for lifecycle flows: invoice (pending_review → approved
 * → released → cleared), draws (draft → submitted → funded).
 *
 * Per UI Review § 06 #42.
 */
export default function LifecycleStepper({
  steps,
  current,
  ended = false,
  className = "",
}: LifecycleStepperProps) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === current));

  return (
    <ol className={`flex items-stretch w-full ${className}`}>
      {steps.map((step, i) => {
        const status: "done" | "current" | "future" =
          i < currentIndex ? "done" : i === currentIndex ? "current" : "future";

        const barColor =
          status === "done"
            ? "var(--status-complete)"
            : status === "current"
            ? ended
              ? "var(--status-planned)"
              : "var(--brand-blue)"
            : "var(--border-weak)";

        const labelColor =
          status === "done"
            ? "color-mix(in srgb, var(--status-complete) 70%, var(--text-primary))"
            : status === "current"
            ? "var(--text-primary)"
            : "var(--text-muted)";

        return (
          <li key={step.id} className="flex-1 min-w-0">
            <div
              className="h-[3px] mb-2"
              style={{ backgroundColor: barColor }}
            />
            <div className="flex items-center gap-1 text-[11px]" style={{ color: labelColor }}>
              {status === "done" && (
                <Check size={11} className="flex-shrink-0" style={{ color: "var(--status-complete)" }} />
              )}
              <span className={status === "current" ? "font-semibold" : "font-medium"}>
                {step.label}
              </span>
            </div>
            {step.caption !== undefined && (
              <div className="text-[10px] text-[color:var(--text-muted)] tabular-nums mt-0.5">
                {step.caption}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
