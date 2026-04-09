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

  // Fetch last completed stage for each project
  const projectIds = (projects ?? []).map((p) => p.id);
  let lastStageByProject: Record<string, string> = {};
  if (projectIds.length > 0) {
    const { data: stages } = await supabase
      .from("build_stages")
      .select("project_id, stage_name, actual_end_date, planned_end_date")
      .in("project_id", projectIds)
      .eq("status", "complete")
      .order("actual_end_date", { ascending: false });

    // Group: keep most recent completed stage per project
    for (const s of stages ?? []) {
      if (!lastStageByProject[s.project_id]) {
        lastStageByProject[s.project_id] = s.stage_name;
      }
    }
  }

  // Fetch phase info for land dev projects
  let phasesByProject: Record<string, { phase_number: number; name: string; status: string; number_of_lots: number | null; lots_sold: number }[]> = {};
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
            phases: phasesByProject[p.id] ?? [],
          }))}
        />
      </main>
    </>
  );
}
