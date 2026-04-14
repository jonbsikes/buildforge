"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createFieldLog(formData: FormData): Promise<{ id: string; project_id: string; log_date: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  revalidatePath("/field-logs");
  return { id: data.id, project_id, log_date };
}

export async function createFieldTodo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const fieldLogId = formData.get("field_log_id") as string;

  await supabase.from("field_todos").insert({
    project_id: formData.get("project_id") as string,
    field_log_id: fieldLogId || null,
    description: formData.get("description") as string,
    priority: (formData.get("priority") as string) || "normal",
    due_date: (formData.get("due_date") as string) || null,
    status: "open",
    created_by: user.id,
  });
  revalidatePath("/field-logs");
}

export async function updateTodoStatus(id: string, status: string) {
  const supabase = await createClient();
  const update: Record<string, string | null> = { status };
  if (status === "done") {
    update.resolved_date = new Date().toISOString().split("T")[0];
  } else {
    update.resolved_date = null;
  }
  await supabase.from("field_todos").update(update).eq("id", id);
  revalidatePath("/field-logs");
}

export async function deleteTodo(id: string) {
  const supabase = await createClient();
  await supabase.from("field_todos").delete().eq("id", id);
  revalidatePath("/field-logs");
}

/**
 * Upload a photo to a field log. Creates a document record in the "Field Photos"
 * folder linked to both the project and the field log. Photo is stored in the
 * "documents" bucket under {user_id}/project/{project_id}/Field Photos/.
 * File name is prefixed with the log date so Documents > Field Photos is
 * naturally date-sorted.
 */
export async function uploadFieldLogPhoto(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  const projectId = formData.get("project_id") as string;
  const fieldLogId = formData.get("field_log_id") as string;
  const logDate = formData.get("log_date") as string;

  if (!file || file.size === 0) throw new Error("No file provided");
  if (!projectId || !fieldLogId) throw new Error("Missing project or log reference");

  // Prefix stored filename with the log date so the documents folder stays chronological.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const datedFileName = `${logDate}_${safeName}`;
  const storagePath = `${user.id}/project/${projectId}/Field Photos/${Date.now()}_${datedFileName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(storagePath);

  const { error: insertError } = await supabase.from("documents").insert({
    project_id: projectId,
    field_log_id: fieldLogId,
    folder: "Field Photos",
    file_name: datedFileName,
    storage_path: urlData?.publicUrl ?? storagePath,
    file_size_kb: Math.ceil(file.size / 1024),
    mime_type: file.type,
    notes: `Field log photo — ${logDate}`,
    uploaded_by: user.id,
  });

  if (insertError) {
    // Roll back the storage upload so we don't leave orphaned files.
    await supabase.storage.from("documents").remove([storagePath]);
    throw new Error(`Could not record photo: ${insertError.message}`);
  }

  revalidatePath(`/projects/${projectId}/field-logs/${fieldLogId}`);
  revalidatePath(`/projects/${projectId}/field-logs`);
  revalidatePath("/documents");
}

export async function deleteFieldLogPhoto(documentId: string, storagePath: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  revalidatePath("/field-logs");
  revalidatePath("/documents");
}
