"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  calculateHomeConstructionDates,
  calculateLandDevDates,
} from "@/lib/stage-schedules";
import { revalidateAfterStageMutation } from "@/lib/cache";

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

  // Planned dates are the project's locked schedule once construction is
  // underway — only actuals/status/notes change as work progresses. Variance
  // is captured by comparing actual vs. planned, not by mutating planned.
  // To rebaseline the schedule (e.g. after editing the project start date),
  // use `resetSchedule` explicitly.
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

  revalidateAfterStageMutation(projectId);
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
    revalidateAfterStageMutation(projectId);
    return {
      error: `${failures.length} of ${stages.length} stage(s) failed (first: stage #${failures[0].stage} ${failures[0].op} — ${failures[0].message}). Reload to see the partial state.`,
    };
  }

  revalidateAfterStageMutation(projectId);
  return {};
}
