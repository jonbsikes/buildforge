import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ProjectDetailClient from "./ProjectDetailClient";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: project },
    { data: stages },
    { data: costItems },
    { data: milestones },
    { data: sales },
    { data: buildStages },
    { data: fieldLogs },
    { data: fieldTodos },
    { data: selections },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("stages").select("*").eq("project_id", id).order("order_index"),
    supabase.from("cost_items").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("milestones").select("*").eq("project_id", id).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("sales").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("build_stages").select("*").eq("project_id", id).order("stage_number"),
    supabase.from("field_logs").select("*").eq("project_id", id).order("log_date", { ascending: false }),
    supabase.from("field_todos").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("selections").select("*").eq("project_id", id).order("category"),
  ]);

  if (!project) notFound();

  return (
    <>
      <Header title={project.name} />
      <main className="flex-1 p-6 overflow-auto">
        <ProjectDetailClient
          project={project}
          stages={stages ?? []}
          costItems={costItems ?? []}
          milestones={milestones ?? []}
          sales={sales ?? []}
          buildStages={buildStages ?? []}
          fieldLogs={fieldLogs ?? []}
          fieldTodos={fieldTodos ?? []}
          selections={selections ?? []}
        />
      </main>
    </>
  );
}
