import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus } from "lucide-react";
import ProjectsClient from "./ProjectsClient";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select(`
      id, name, address, status, project_type, subdivision, start_date, end_date,
      created_at, block, lot, lot_size_acres, plan, home_size_sf,
      size_acres, number_of_lots, number_of_phases
    `)
    .order("start_date", { ascending: true })
    .order("address", { ascending: true });

  // Fetch all build stages for each project (for last completed, delayed, and next stage)
  const projectIds = (projects ?? []).map((p) => p.id);
  let lastStageByProject: Record<string, string> = {};
  let delayedStagesByProject: Record<string, { stage_name: string; planned_end_date: string }[]> = {};
  let nextStageByProject: Record<string, { stage_name: string; planned_start_date: string | null }> = {};
  if (projectIds.length > 0) {
    const { data: allStages } = await supabase
      .from("build_stages")
      .select("project_id, stage_name, stage_number, status, planned_start_date, planned_end_date, actual_end_date")
      .in("project_id", projectIds)
      .order("stage_number", { ascending: true });

    const today = new Date().toISOString().split("T")[0];

    for (const s of allStages ?? []) {
      if (s.status === "complete") {
        if (!lastStageByProject[s.project_id]) {
          lastStageByProject[s.project_id] = s.stage_name;
        } else {
          lastStageByProject[s.project_id] = s.stage_name;
        }
      }

      if (s.status !== "complete" && s.status !== "skipped" && s.planned_end_date && s.planned_end_date < today) {
        if (!delayedStagesByProject[s.project_id]) delayedStagesByProject[s.project_id] = [];
        delayedStagesByProject[s.project_id].push({
          stage_name: s.stage_name,
          planned_end_date: s.planned_end_date,
        });
      }

      if (s.status === "not_started" && !nextStageByProject[s.project_id]) {
        nextStageByProject[s.project_id] = {
          stage_name: s.stage_name,
          planned_start_date: s.planned_start_date,
        };
      }
    }
  }

  // Fetch phase info for land dev projects
  let phasesByProject: Record<string, { phase_number: number | null; name: string | null; status: string; number_of_lots: number | null; lots_sold: number }[]> = {};
  const landIds = (projects ?? []).filter((p) => p.project_type === "land_development").map((p) => p.id);
  if (landIds.length > 0) {
    const { data: phases } = await supabase
      .from("project_phases")
      .select("project_id, phase_number, name, status, number_of_lots, lots_sold")
      .in("project_id", landIds)
      .order("phase_number", { ascending: true });
    for (const ph of phases ?? []) {
      if (!phasesByProject[ph.project_id]) phasesByProject[ph.project_id] = [];
      phasesByProject[ph.project_id].push(ph);
    }
  }

  return (
    <>
      <Header title="Projects" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">
            {(projects ?? []).length} project{(projects ?? []).length !== 1 ? "s" : ""}
          </p>
          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
          >
            <Plus size={16} />
            New Project
          </Link>
        </div>

        <ProjectsClient
          projects={(projects ?? []).map((p) => ({
            ...p,
            lastStageCompleted: lastStageByProject[p.id] ?? null,
            delayedStages: delayedStagesByProject[p.id] ?? [],
            nextStage: nextStageByProject[p.id] ?? null,
            phases: phasesByProject[p.id] ?? [],
          }))}
        />
      </main>
    </>
  );
}
