"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
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
    const actualEnd  = new Date(input.actual_end_date  + "T00:00:00");
    const plannedEnd = new Date(current.planned_end_date + "T00:00:00");

    // delta: negative = finished early (shift earlier), positive = finished late (shift later)
    const delta = Math.round(
      (actualEnd.getTime() - plannedEnd.getTime()) / 86400000
    );

    if (delta !== 0) {
      // Fetch all not_started stages for this project with higher stage_number
      const { data: laterStages } = await supabase
        .from("build_stages")
        .select("id, planned_start_date, planned_end_date")
        .eq("project_id", projectId)
        .eq("status", "not_started")
        .gt("stage_number", current.stage_number);

      if (laterStages && laterStages.length > 0) {
        // Build batch updates
        for (const stage of laterStages) {
          if (!stage.planned_start_date || !stage.planned_end_date) continue;

          const newStart = shiftDate(stage.planned_start_date, delta);
          const newEnd   = shiftDate(stage.planned_end_date,   delta);

          await supabase
            .from("build_stages")
            .update({
              planned_start_date: newStart,
              planned_end_date:   newEnd,
            })
            .eq("id", stage.id);
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

  // Upsert: update existing, insert missing
  for (const s of stages) {
    const existingId = existingMap.get(s.stage_number);

    if (existingId) {
      // Update planned dates and track only
      await supabase
        .from("build_stages")
        .update({
          planned_start_date: s.planned_start_date,
          planned_end_date:   s.planned_end_date,
          track:              s.track,
          stage_name:         s.stage_name,
        })
        .eq("id", existingId);
    } else {
      // Insert new stage
      await supabase.from("build_stages").insert({
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
    }
  }

  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
