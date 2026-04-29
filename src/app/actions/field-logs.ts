"use server";

import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth";
import {
  revalidateAfterFieldLogMutation,
  revalidateAfterTodoMutation,
} from "@/lib/cache";

// ---------------------------------------------------------------------------
// Global field logs (cross-project)
// ---------------------------------------------------------------------------

export async function createFieldLog(
  formData: FormData
): Promise<{ id: string; project_id: string; log_date: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) throw new Error(editorCheck.error);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const project_id = formData.get("project_id") as string;
  const log_date = formData.get("log_date") as string;

  const { data, error } = await supabase
    .from("field_logs")
    .insert({
      project_id,
      log_date,
      notes: formData.get("notes") as string,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create field log");

  revalidateAfterFieldLogMutation(project_id);
  return { id: data.id, project_id, log_date };
}

export async function createFieldTodo(formData: FormData) {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) throw new Error(editorCheck.error);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const fieldLogId = formData.get("field_log_id") as string;

  const projectId = formData.get("project_id") as string;
  await supabase.from("field_todos").insert({
    project_id: projectId,
    field_log_id: fieldLogId || null,
    description: formData.get("description") as string,
    priority: (formData.get("priority") as string) || "normal",
    due_date: (formData.get("due_date") as string) || null,
    status: "open",
    created_by: user.id,
  });
  revalidateAfterTodoMutation(projectId);
}

export async function updateTodoStatus(id: string, status: string) {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) throw new Error(editorCheck.error);
  const supabase = await createClient();
  const update: Record<string, string | null> = { status };
  if (status === "done") {
    update.resolved_date = new Date().toISOString().split("T")[0];
  } else {
    update.resolved_date = null;
  }
  await supabase.from("field_todos").update(update).eq("id", id);
  revalidateAfterTodoMutation();
}

export async function deleteTodo(id: string) {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) throw new Error(editorCheck.error);
  const supabase = await createClient();
  await supabase.from("field_todos").delete().eq("id", id);
  revalidateAfterTodoMutation();
}

export async function updateFieldTodo(
  id: string,
  input: { description: string; priority: string; due_date: string | null }
) {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) throw new Error(editorCheck.error);
  const supabase = await createClient();
  await supabase
    .from("field_todos")
    .update({
      description: input.description,
      priority: input.priority,
      due_date: input.due_date || null,
    })
    .eq("id", id);
  revalidateAfterTodoMutation();
}

export async function updateFieldLog(
  _id: string,
  _input: { log_date: string; notes: string }
) {
  // Field logs are read-only once saved (CLAUDE.md business rule).
  // To-dos are updatable at any time.
  throw new Error("Field logs are read-only once saved.");
}

export async function deleteFieldLog(id: string) {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) throw new Error(editorCheck.error);
  const supabase = await createClient();
  const { data } = await supabase
    .from("field_logs")
    .select("project_id")
    .eq("id", id)
    .single();
  // Remove field_todos referencing this log first (if FK is not set to cascade)
  await supabase.from("field_todos").delete().eq("field_log_id", id);
  const { error } = await supabase.from("field_logs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAfterFieldLogMutation(data?.project_id ?? undefined);
}

// ---------------------------------------------------------------------------
// Photo upload / delete
// ---------------------------------------------------------------------------

/**
 * Upload a photo to a field log. Creates a document record in the "Field Photos"
 * folder linked to both the project and the field log. Photo is stored in the
 * "documents" bucket under {user_id}/project/{project_id}/Field Photos/.
 * File name is prefixed with the log date so Documents > Field Photos is
 * naturally date-sorted.
 */
export async function uploadFieldLogPhoto(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  const projectId = formData.get("project_id") as string;
  const fieldLogId = formData.get("field_log_id") as string;
  const logDate = formData.get("log_date") as string;

  if (!file || file.size === 0) throw new Error("No file provided");
  if (!projectId || !fieldLogId) throw new Error("Missing project or log reference");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const datedFileName = `${logDate}_${safeName}`;
  const storagePath = `${user.id}/project/${projectId}/Field Photos/${Date.now()}_${datedFileName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { error: insertError } = await supabase.from("documents").insert({
    project_id: projectId,
    field_log_id: fieldLogId,
    folder: "Field Photos",
    file_name: datedFileName,
    storage_path: storagePath,
    file_size_kb: Math.ceil(file.size / 1024),
    mime_type: file.type,
    notes: `Field log photo — ${logDate}`,
    uploaded_by: user.id,
  });

  if (insertError) {
    await supabase.storage.from("documents").remove([storagePath]);
    throw new Error(`Could not record photo: ${insertError.message}`);
  }

  revalidateAfterFieldLogMutation(projectId);
}

export async function deleteFieldLogPhoto(
  documentId: string,
  storagePath: string | null
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (storagePath) {
    const pathMatch = storagePath.match(/\/documents\/(.+)$/);
    const relPath = pathMatch ? pathMatch[1] : storagePath;
    await supabase.storage.from("documents").remove([relPath]);
  }

  await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("uploaded_by", user.id);

  revalidateAfterFieldLogMutation();
}

// ---------------------------------------------------------------------------
// Project-scoped field logs (used by project detail tabs)
// ---------------------------------------------------------------------------

export async function createProjectFieldLog(
  projectId: string,
  formData: FormData
): Promise<{ id: string; log_date: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) throw new Error(editorCheck.error);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const log_date = formData.get("log_date") as string;

  const { data, error } = await supabase
    .from("field_logs")
    .insert({
      project_id: projectId,
      log_date,
      notes: formData.get("notes") as string,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create field log");

  revalidateAfterFieldLogMutation(projectId);
  return { id: data.id, log_date };
}

export async function createProjectFieldTodo(
  projectId: string,
  logId: string | null,
  formData: FormData
) {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) throw new Error(editorCheck.error);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("field_todos").insert({
    project_id: projectId,
    field_log_id: logId,
    description: formData.get("description") as string,
    priority: (formData.get("priority") as string) || "normal",
    due_date: (formData.get("due_date") as string) || null,
    status: "open",
    created_by: user.id,
  });
  revalidateAfterTodoMutation(projectId);
}

export async function updateProjectTodoStatus(
  projectId: string,
  todoId: string,
  status: string
) {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) throw new Error(editorCheck.error);
  const supabase = await createClient();
  const update: Record<string, string | null> = { status };
  if (status === "done") update.resolved_date = new Date().toISOString().split("T")[0];
  else update.resolved_date = null;
  await supabase.from("field_todos").update(update).eq("id", todoId);
  revalidateAfterTodoMutation(projectId);
}
