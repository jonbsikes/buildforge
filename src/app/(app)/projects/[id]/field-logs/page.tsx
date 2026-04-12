import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, BookOpen, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default async function FieldLogsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, logsRes] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).single(),
    supabase
      .from("field_logs")
      .select("id, log_date, notes, created_at")
      .eq("project_id", id)
      .order("log_date", { ascending: false }),
  ]);

  if (!projectRes.data) notFound();

  const logs = logsRes.data ?? [];

  // Get todo counts per log
  const logIds = logs.map((l) => l.id);
  const todosRes = logIds.length
    ? await supabase
        .from("field_todos")
        .select("field_log_id, status")
        .in("field_log_id", logIds)
    : { data: [] };
  const todos = todosRes.data ?? [];

  const todosByLog = todos.reduce<Record<string, { open: number; done: number }>>((acc, t) => {
    if (!t.field_log_id) return acc;
    if (!acc[t.field_log_id]) acc[t.field_log_id] = { open: 0, done: 0 };
    if (t.status === "done") acc[t.field_log_id].done++;
    else acc[t.field_log_id].open++;
    return acc;
  }, {});

  return (
    <>
      <Header title="Field Logs" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <Link href={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft size={15} /> {projectRes.data.name}
            </Link>
            <Link
              href={`/projects/${id}/field-logs/new`}
              className="inline-flex items-center gap-2 bg-[#4272EF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600"
            >
              <Plus size={15} /> New Log
            </Link>
          </div>

          {logs.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-16 text-center">
              <BookOpen size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium mb-1">No field logs yet</p>
              <p className="text-gray-400 text-sm mb-4">Record daily observations, work performed, and site notes.</p>
              <Link
                href={`/projects/${id}/field-logs/new`}
                className="inline-flex items-center gap-1.5 bg-[#4272EF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600"
              >
                <Plus size={14} /> Create First Log
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const counts = todosByLog[log.id] ?? { open: 0, done: 0 };
                return (
                  <Link
                    key={log.id}
                    href={`/projects/${id}/field-logs/${log.id}`}
                    className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm hover:border-blue-200 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar size={13} className="text-gray-400 shrink-0" />
                          <span className="text-sm font-semibold text-gray-900">{fmtDate(log.log_date)}</span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{log.notes}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        {counts.open + counts.done > 0 && (
                          <div className="text-xs text-gray-500">
                            <span className={counts.open > 0 ? "text-amber-600 font-medium" : "text-green-600 font-medium"}>
                              {counts.open} open
                            </span>
                            {" · "}
                            <span className="text-gray-400">{counts.done} done</span>
                          </div>
                        )}
                        <span className="text-xs text-gray-400 mt-1 block">View →</span>
                      </div>
                    </div>
                  </Link>
     