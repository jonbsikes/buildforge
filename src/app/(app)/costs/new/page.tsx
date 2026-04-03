// @ts-nocheck
import Header from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import NewCostForm from "./NewCostForm";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Stage = Database["public"]["Tables"]["stages"]["Row"];
type CostCode = Database["public"]["Tables"]["cost_codes"]["Row"];

export default async function NewCostPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: projectId } = await searchParams;
  const supabase = await createClient();

  const [projectsResult, stagesResult, costCodesResult] = await Promise.all([
    supabase.from("projects").select("id, name, project_type").order("name"),
    projectId
      ? supabase.from("stages").select("id, name, project_id").eq("project_id", projectId)
      : supabase.from("stages").select("id, name, project_id"),
    supabase.from("cost_codes").select("*").eq("is_active", true).order("code"),
  ]);

  const projects = (projectsResult.data ?? []) as Pick<Project, "id" | "name" | "project_type">[];
  const stages = (stagesResult.data ?? []) as Pick<Stage, "id" | "name" | "project_id">[];
  const costCodes = (costCodesResult.data ?? []) as CostCode[];

  return (
    <>
      <Header title="Add Cost Item" />
      <NewCostForm
        projects={projects}
        stages={stages}
        costCodes={costCodes}
        defaultProjectId={projectId}
      />
    </>
  );
}
