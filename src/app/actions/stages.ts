"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  calculateHomeConstructionDates,
  calculateLandDevDates,
} from "@/lib/stage-schedules";

// ---------------------------------------------------------------------------
// updateStage
// ---------------------------------------------------------------------------

export interface UpdateStageInput {
  actual_start_date: string | null;
  actual_end_date: string | null;
  status: string;
  notes: string | null;
}

export async function updateStage(
  stageId: string,
  input: UpdateStageInput,
  projectId: string
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();

  // Fetch the current stage for planned_end_date and stage_number
  const { data: current } = await supabase
    .from("build_stages")
    .select("stage_number, planned_end_date, status")
    .eq("id", stageId)
    .single();

  if (!current) return { error: "Stage not found" };

  // Apply the update
  const { error: updateErr } = await supabase
    .from("build_stages")
    .update({
      actual_start_date: input.actual_start_date || null,
      actual_end_date:   input.actual_end_date   || null,
      status:            input.status,
      notes:             input.notes             || null,
    })
    .eq("id", stageId);

  if (updateErr) return { error: updateErr.message };

  // When marking complete with an actual_end_date, shift subsequent not_started stages
  if (
    input.status === "complete" &&
    input.actual_end_date &&
    current.planned_end_date
  ) {
    // delta: negative = finished early (shift earlier), positive = finished late (shift later)
    // UTC-based diff — `Date.parse(YYYY-MM-DD)` is interpreted as UTC midnight,
    // which sidesteps the local-DST drift the previous `Date(.. + "T00:00:00")`
    // construction caused (a stage transition across a DST boundary used to
    // produce a delta of N±1, skewing every later stage).
    const delta = diffCalendarDays(input.actual_end_date, current.planned_end_date);

    if (delta !== 0) {
      // Fetch all not_started stages for this project with higher stage_number
      const { data: laterStages } = await supabase
        .from("build_stages")
        .select("id, planned_start_date, planned_end_date")
        .eq("project_id", projectId)
        .eq("status", "not_started")
        .gt("stage_number", current.stage_number);

      if (laterStages && laterStages.length > 0) {
        // Batch all stage shifts concurrently
        const shiftResults = await Promise.all(
          laterStages
            .filter((s) => s.planned_start_date && s.planned_end_date)
            .map((stage) =>
              supabase
                .from("build_stages")
                .update({
                  planned_start_date: shiftDate(stage.planned_start_date!, delta),
                  planned_end_date:   shiftDate(stage.planned_end_date!, delta),
                })
                .eq("id", stage.id)
            )
        );

        const failed = shiftResults.filter((r) => r.error);
        if (failed.length > 0) {
          // Log every failure so the user can see the full set; surface the
          // first message in the returned error. Without the full log, only
          // the first failure was visible and the user couldn't tell which
          // stages were left in a partially-shifted state.
          for (const f of failed) {
            console.error("[stages.updateStage] shift failed:", f.error);
          }
          return {
            error: `${failed.length} of ${shiftResults.length} stage(s) failed to shift: ${failed[0].error!.message}`,
          };
        }
      }
    }
  }

  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---------------------------------------------------------------------------
// resetSchedule
// Recalculates planned dates for all stages from the project's start_date.
// Does NOT modify baseline_start_date, baseline_end_date, actual dates, or status.
// ---------------------------------------------------------------------------
export async function resetSchedule(
  projectId: string
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();

  // Fetch project type and start date
  const { data: project } = await supabase
    .from("projects")
    .select("project_type, start_date")
    .eq("id", projectId)
    .single();

  if (!project) return { error: "Project not found" };
  if (!project.start_date) return { error: "Project has no start date set" };

  const isHome = project.project_type === "home_construction";
  const stages = isHome
    ? calculateHomeConstructionDates(project.start_date)
    : calculateLandDevDates(project.start_date);

  // Fetch existing stages for this project
  const { data: existing } = await supabase
    .from("build_stages")
    .select("id, stage_number")
    .eq("project_id", projectId);

  const existingMap = new Map<number, string>(
    (existing ?? []).map((s) => [s.stage_number, s.id])
  );

  // Upsert: update existing, insert missing.
  // Collect errors instead of silently swallowing — a single failure used to
  // leave the schedule partially reset with no signal to the user.
  const failures: Array<{ stage: number; op: "update" | "insert"; message: string }> = [];

  for (const s of stages) {
    const existingId = existingMap.get(s.stage_number);

    if (existingId) {
      const { error } = await supabase
        .from("build_stages")
        .update({
          planned_start_date: s.planned_start_date,
          planned_end_date:   s.planned_end_date,
          track:              s.track,
          stage_name:         s.stage_name,
        })
        .eq("id", existingId);
      if (error) failures.push({ stage: s.stage_number, op: "update", message: error.message });
    } else {
      const { error } = await supabase.from("build_stages").insert({
        project_id:          projectId,
        stage_number:        s.stage_number,
        stage_name:          s.stage_name,
        track:               s.track,
        status:              "not_started",
        planned_start_date:  s.planned_start_date,
        planned_end_date:    s.planned_end_date,
        baseline_start_date: s.baseline_start_date,
        baseline_end_date:   s.baseline_end_date,
      });
      if (error) failures.push({ stage: s.stage_number, op: "insert", message: error.message });
    }
  }

  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`[stages.resetSchedule] ${f.op} stage #${f.stage} failed:`, f.message);
    }
    revalidatePath(`/projects/${projectId}`);
    return {
      error: `${failures.length} of ${stages.length} stage(s) failed (first: stage #${failures[0].stage} ${failures[0].op} — ${failures[0].message}). Reload to see the partial state.`,
    };
  }

  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// All date math here is done in UTC to dodge DST-boundary off-by-one errors.
// Inputs are assumed to be YYYY-MM-DD calendar dates with no time component.

function parseYmd(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split("-").map((p) => parseInt(p, 10));
  return [y, m, d];
}

function diffCalendarDays(later: string, earlier: string): number {
  const [y1, m1, d1] = parseYmd(later);
  const [y2, m2, d2] = parseYmd(earlier);
  const ms = Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2);
  return Math.round(ms / 86400000);
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = parseYmd(dateStr);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().split("T")[0];
}
