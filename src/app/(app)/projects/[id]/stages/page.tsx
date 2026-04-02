import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import StageTrackerClient from "./StageTrackerClient";

export const dynamic = "force-dynamic";

export default async function ProjectStagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, masterStagesRes, projectStagesRes] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).single(),
    supabase.from("build_stages").select("*").order("stage_number"),
    supabase.from("project_stages").select("*").eq("project_id", id),
  ]);

  if (!projectRes.data) notFound();

  return (
    <>
      <Header title="Build Stage Tracker" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <Link href={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
            <ArrowLeft size={15} /> {projectRes.data.name}
          </Link>
          <StageTrackerClient
            projectId={id}
            masterStages={masterStagesRes.data ?? []}
            projectStages={projectStagesRes.data ?? []}
          />
        </div>
      </main>
    </>
  );
}
