"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createFieldLog(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("field_logs").insert({
    project_id: formData.get("project_id") as string,
    log_date: formData.get("log_date") as string,
    notes: formData.get("notes") as string,
    created_by: user.id,
  });
  revalidatePath("/field-logs");
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
