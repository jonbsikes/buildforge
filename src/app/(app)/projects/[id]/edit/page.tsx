import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import EditProjectForm from "./EditProjectForm";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).single();

  if (!project) notFound();

  return (
    <>
      <Header title="Edit Project" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-xl">
          <div className="mb-4">
            <a href={`/projects/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
              ← Back to {project.name}
            </a>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <EditProjectForm project={project} />
          </div>
        </div>
      </main>
    </>
  );
}
