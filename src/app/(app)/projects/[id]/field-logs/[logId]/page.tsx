import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar } from "lucide-react";
import TodoList from "./TodoList";
import FieldLogPhotos, { type FieldLogPhoto } from "../FieldLogPhotos";

export const dynamic = "force-dynamic";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const priorityStyles: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-700",
  urgent: "bg-red-100 text-red-700",
};

export default async function FieldLogDetailPage({
  params,
}: {
  params: Promise<{ id: string; logId: string }>;
}) {
  const { id, logId } = await params;
  const supabase = await createClient();

  const [projectRes, logRes, todosRes, photosRes] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).single(),
    supabase.from("field_logs").select("*").eq("id", logId).single(),
    supabase
      .from("field_todos")
      .select("*")
      .eq("field_log_id", logId)
      .order("created_at", { ascending: true }),
    supabase
      .from("documents")
      .select("id, file_name, storage_path, mime_type, created_at")
      .eq("field_log_id", logId)
      .order("created_at", { ascending: true }),
  ]);

  if (!projectRes.data || !logRes.data) notFound();

  const log = logRes.data;
  const todos = todosRes.data ?? [];
  const photos = (photosRes.data ?? []) as FieldLogPhoto[];

  return (
    <>
      <Header title={`Log — ${fmtDate(log.log_date)}`} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <Link
            href={`/projects/${id}/field-logs`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5"
          >
            <ArrowLeft size={15} /> Field Logs
          </Link>

          {/* Log body */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={15} className="text-gray-400" />
              <span className="font-semibold text-gray-900">{fmtDate(log.log_date)}</span>
            </div>
            <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{log.notes}</p>
            <p className="text-xs text-gray-400 mt-4">
              Logged {new Date(log.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-xl border border-gray-200 mb-5">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Photos
                {photos.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">{photos.length}</span>
                )}
              </h2>
              <Link
                href={`/documents?folder=Field+Photos&project=${id}`}
                className="text-sm text-[#4272EF] hover:underline"
              >
                View in Documents
              </Link>
            </div>
            <div className="p-5">
              <FieldLogPhotos
                projectId={id}
                fieldLogId={logId}
                logDate={log.log_date}
                initialPhotos={photos}
              />
            </div>
          </div>

          {/* To-dos */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                To-Dos
                {todos.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {todos.filter((t) => t.status !== "done").length} open
                  </span>
                )}
              </h2>
              <Link
                href={`/projects/${id}/field-logs/${logId}/add-todo`}
                className="inline-flex items-center gap-1 text-sm text-[#4272EF] hover:underline"
              >
                + Add
              </Link>
            </div>

            {todos.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-gray-400 text-sm">No to-dos on this log.</p>
              </div>
            ) : (
              <TodoList
                todos={todos.map((t) => ({
                  id: t.id,
                  description: t.description,
                  status: t.status as "open" | "in_progress" | "done",
                  priority: t.priority as "low" | "normal" | "urgent",
                  due_date: t.due_date,
                }))}
                priorityStyles={priorityStyles}
              />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
