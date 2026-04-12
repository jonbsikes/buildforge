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

  // Fetch all build stages for each project — compute per-track summaries
  // Each track (exterior / interior) gets: last completed, in-progress, and next stage
  const projectIds = (projects ?? []).map((p) => p.id);
  type TrackSummary = {
    lastCompleted: string | null;
    inProgress: string | null;
    next: { stage_name: string; planned_start_date: string | null } | null;
  };
  type ProjectStageInfo = {
    exterior: TrackSummary;
    interior: TrackSummary;
    delayedStages: { stage_name: string; planned_end_date: string }[];
  };
  const emptyTrack = (): TrackSummary => ({ lastCompleted: null, inProgress: null, next: null });
  let stageInfoByProject: Record<string, ProjectStageInfo> = {};

  if (projectIds.length > 0) {
    const { data: allStages } = await supabase
      .from("build_stages")
      .select("project_id, stage_name, stage_number, status, track, planned_start_date, planned_end_date, actual_end_date")
      .in("project_id", projectIds)
      .order("stage_number", { ascending: true });

    const today = new Date().toISOString().split("T")[0];

    for (const s of allStages ?? []) {
      if (!stageInfoByProject[s.project_id]) {
        stageInfoByProject[s.project_id] = {
          exterior: emptyTrack(),
          interior: emptyTrack(),
          delayedStages: [],
        };
      }
      const info = stageInfoByProject[s.project_id];
      const track = (s.track === "interior" ? "interior" : "exterior") as "exterior" | "interior";
      const t = info[track];

      // Last completed (keeps overwriting — stages are ordered, so last write wins)
      if (s.status === "complete") {
        t.lastCompleted = s.stage_name;
      }

      // In-progress (first one per track)
      if (s.status === "in_progress" && !t.inProgress) {
        t.inProgress = s.stage_name;
      }

      // Next not_started (first one per track)
      if (s.status === "not_started" && !t.next) {
        t.next = { stage_name: s.stage_name, planned_start_date: s.planned_start_date };
      }

      // Delayed stages (any track)
      if (s.status !== "complete" && s.status !== "skipped" && s.planned_end_date && s.planned_end_date < today) {
        info.delayedStages.push({ stage_name: s.stage_name, planned_end_date: s.planned_end_date });
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
            {(pro