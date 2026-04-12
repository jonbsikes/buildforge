"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createTodo(input: {
  project_id: string;
  description: string;
  priority: string;
  due_date: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("field_todos").insert({
    project_id: input.project_id,
    field_log_id: null,
    description: input.description,
    priority: input.priority,
    due_date: input.due_date || null,
    status: "open",
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/todos");
  revalidatePath("/projects/" + input.project_id);
  return {};
}

export async function completeTodo(todoId: string, projectId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("field_todos")
    .update({ status: "done", resolved_date: new Date().toISOString().split("T")[0] })
    .eq("id", todoId);
  if (error) return { error: error.message };
  revalidatePath("/todos");
  revalidatePath("/projects/" + projectId);
  return {};
}

export async function reopenTodo(todoId: string, projectId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("field_todos")
    .update({ status: "open", resolved_date: null })
    .eq("id", todoId);
  if (error) return { error: error.message };
  revalidatePath("/todos");
  revalidatePath("/projects/" + projectId);
  return {};
}

export async function deleteTodo(todoId: string, projectId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("field_todos").delete().eq("id", todoId);
  if (error) return { error: error.message };
  revalidatePath("/todos");
  revalidatePath("/projects/" + projectId);
  return {};
}
