import Header from "@/components/layout/Header";
import TodosClient from "@/components/todos/TodosClient";
import { createClient } from "@/lib/supabase/server";


// Server-render the initial data (Package 03 §Step 3) — the client keeps
// mutations + refreshTodos(), but first paint carries content, no spinner.
export default async function TodosPage() {
  const supabase = await createClient();

  const [{ data: projects }, { data: todos }] = await Promise.all([
    supabase.from("projects").select("id, name").order("name"),
    supabase
      .from("field_todos")
      .select("id, description, priority, due_date, status, project_id, resolved_date, created_at")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <Header title="To-Do List" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <TodosClient initialProjects={projects ?? []} initialTodos={todos ?? []} />
      </main>
    </>
  );
}
