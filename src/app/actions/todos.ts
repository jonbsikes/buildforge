"use server";

import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth";
import { revalidateAfterTodoMutation } from "@/lib/cache";

export async function createTodo(input: {
  project_id: string;
  description: string;
  priority: string;
  due_date: string | null;
}): Promise<{ error?: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return { error: editorCheck.error };
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
  revalidateAfterTodoMutation(input.project_id);
  return {};
}

export async function completeTodo(todoId: string, projectId: string): Promise<{ error?: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return { error: editorCheck.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("field_todos")
    .update({ status: "done", resolved_date: new Date().toISOString().split("T")[0] })
    .eq("id", todoId);
  if (error) return { error: error.message };
  revalidateAfterTodoMutation(projectId);
  return {};
}

export async function reopenTodo(todoId: string, projectId: string): Promise<{ error?: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return { error: editorCheck.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("field_todos")
    .update({ status: "open", resolved_date: null })
    .eq("id", todoId);
  if (error) return { error: error.message };
  revalidateAfterTodoMutation(projectId);
  return {};
}

export async function deleteTodo(todoId: string, projectId: string): Promise<{ error?: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return { error: editorCheck.error };
  const supabase = await createClient();
  const { error } = await supabase.from("field_todos").delete().eq("id", todoId);
  if (error) return { error: error.message };
  revalidateAfterTodoMutation(projectId);
  return {};
}

export async function updateTodo(
  todoId: string,
  projectId: string,
  input: { description: string; priority: string; due_date: string | null }
): Promise<{ error?: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return { error: editorCheck.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("field_todos")
    .update({
      description: input.description,
      priority: input.priority,
      due_date: input.due_date || null,
    })
    .eq("id", todoId);
  if (error) return { error: error.message };
  revalidateAfterTodoMutation(projectId);
  return {};
}
