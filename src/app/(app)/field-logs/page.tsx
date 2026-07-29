import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import FieldLogsClient from "./FieldLogsClient";

const PAGE_SIZE = 50;

// Scoped + paginated (Package 03 §Step 4): explicit columns, server-side
// project filter via ?project=, and keyset pagination via ?before=<log_date>.
export default async function FieldLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; before?: string }>;
}) {
  const { project, before } = await searchParams;
  const supabase = await createClient();

  let logsQuery = supabase
    .from("field_logs")
    .select("id, project_id, project_stage_id, log_date, notes, created_by, created_at")
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (project) logsQuery = logsQuery.eq("project_id", project);
  if (before) logsQuery = logsQuery.lt("log_date", before);

  let todosQuery = supabase
    .from("field_todos")
    .select("id, project_id, field_log_id, description, status, priority, due_date, resolved_date, created_by, created_at")
    .order("created_at", { ascending: false });
  if (project) todosQuery = todosQuery.eq("project_id", project);

  const [{ data: logs }, { data: projects }, { data: todos }] = await Promise.all([
    logsQuery,
    supabase.from("projects").select("id, name").order("name"),
    todosQuery,
  ]);

  return (
    <>
      <Header title="Field Logs" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <FieldLogsClient
          logs={(logs ?? []) as Parameters<typeof FieldLogsClient>[0]["logs"]}
          projects={projects ?? []}
          todos={(todos ?? []) as Parameters<typeof FieldLogsClient>[0]["todos"]}
          activeProject={project ?? ""}
          hasMore={(logs ?? []).length === PAGE_SIZE}
        />
      </main>
    </>
  );
}
