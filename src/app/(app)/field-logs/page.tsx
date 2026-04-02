import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import FieldLogsClient from "./FieldLogsClient";

export const dynamic = "force-dynamic";

export default async function FieldLogsPage() {
  const supabase = await createClient();
  const [{ data: logs }, { data: projects }, { data: todos }] = await Promise.all([
    supabase
      .from("field_logs")
      .select("*")
      .order("log_date", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("field_todos").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <Header title="Field Logs" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <FieldLogsClient
          logs={logs ?? []}
          projects={projects ?? []}
          todos={todos ?? []}
        />
      </main>
    </>
  );
}
