import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import TodosClient from "./TodosClient";


export default async function ProjectTodosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, todosRes] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).single(),
    supabase
      .from("field_todos")
      .select("*, field_logs(log_date)")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!projectRes.data) notFound();

  return (
    <>
      <Header title="To-Dos" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <Link href={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft size={15} /> {projectRes.data.name}
            </Link>
          </div>
          <TodosClient
            projectId={id}
            todos={(todosRes.data ?? []).map((t) => ({
              id: t.id,
              description: t.description,
              status: t.status as "open" | "in_progress" | "done",
              priority: t.priority as "low" | "normal" | "urgent",
              due_date: t.due_date,
              field_log_id: t.field_log_id,
              log_date: (t.field_logs as { log_date: string } | null)?.log_date ?? null,
              created_at: t.created_at,
            }))}
          />
        </div>
      </main>
    </>
  );
}
