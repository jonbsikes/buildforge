"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// --- Stages ---

export async function createStage(projectId: string, formData: FormData) {
  const supabase = await createClient();

  // Get current max order_index
  const { data: existing } = await supabase
    .from("stages")
    .select("order_index")
    .eq("project_id", projectId)
    .order("order_index", { ascending: false })
    .limit(1);

  const lastStage = existing?.[0] as { order_index: number } | undefined;
  const nextIndex = lastStage ? lastStage.order_index + 1 : 0;

  const { error } = await supabase.from("stages").insert({
    project_id: projectId,
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
    status: (formData.get("status") as Database["public"]["Enums"]["stage_status"]) || "not_started",
    budget: parseFloat((formData.get("budget") as string) || "0"),
    start_date: (formData.get("start_date") as string) || null,
    end_date: (formData.get("end_date") as string) || null,
    order_index: nextIndex,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateStage(projectId: string, stageId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("stages").update({
    name: formData.get("name") as string,
    description: (formData.get("description") as string) || null,
    status: formData.get("status") as Database["public"]["Enums"]["stage_status"],
    budget: parseFloat((formData.get("budget") as string) || "0"),
    start_date: (formData.get("start_date") as string) || null,
    end_date: (formData.get("end_date") as string) || null,
  }).eq("id", stageId);

  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteStage(projectId: string, stageId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("stages").delete().eq("id", stageId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

// --- Cost Items ---

export async function createCostItem(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("cost_items").insert({
    project_id: projectId,
    stage_id: (formData.get("stage_id") as string) || null,
    category: (formData.get("category") as Database["public"]["Enums"]["cost_category"]) || "other",
    description: formData.get("description") as string,
    budgeted_amount: parseFloat((formData.get("budgeted_amount") as string) || "0"),
    actual_amount: parseFloat((formData.get("actual_amount") as string) || "0"),
    vendor: (formData.get("vendor") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateCostItem(projectId: string, itemId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("cost_items").update({
    stage_id: (formData.get("stage_id") as string) || null,
    category: formData.get("category") as Database["public"]["Enums"]["cost_category"],
    description: formData.get("description") as string,
    budgeted_amount: parseFloat((formData.get("budgeted_amount") as string) || "0"),
    actual_amount: parseFloat((formData.get("actual_amount") as string) || "0"),
    vendor: (formData.get("vendor") as string) || null,
    notes: (formData.get("notes") as string) || null,
  }).eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteCostItem(projectId: string, itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cost_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

// --- Milestones ---

export async function createMilestone(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("milestones").insert({
    project_id: projectId,
    stage_id: (formData.get("stage_id") as string) || null,
    name: formData.get("name") as string,
    due_date: (formData.get("due_date") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function toggleMilestone(projectId: string, milestoneId: string, isCompleted: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("milestones").update({
    is_completed: isCompleted,
    completed_date: isCompleted ? new Date().toISOString().split("T")[0] : null,
  }).eq("id", milestoneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteMilestone(projectId: string, milestoneId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("milestones").delete().eq("id", milestoneId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

// --- Sales ---

export async function createSale(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("sales").insert({
    project_id: projectId,
    sale_type: (formData.get("sale_type") as Database["public"]["Enums"]["sale_type"]) || "other",
    description: formData.get("description") as string,
    buyer_name: (formData.get("buyer_name") as string) || null,
    contract_price: parseFloat((formData.get("contract_price") as string) || "0") || null,
    deposit_amount: parseFloat((formData.get("deposit_amount") as string) || "0") || null,
    deposit_received_date: (formData.get("deposit_received_date") as string) || null,
    settlement_date: (formData.get("settlement_date") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function settleSale(projectId: string, saleId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("sales").update({
    is_settled: true,
    settled_amount: parseFloat((formData.get("settled_amount") as string) || "0"),
    settled_date: (formData.get("settled_date") as string) || new Date().toISOString().split("T")[0],
  }).eq("id", saleId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteSale(projectId: string, saleId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sales").delete().eq("id", saleId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

// --- Build Stages ---

export async function upsertBuildStage(
  projectId: string,
  stageNumber: number,
  stageName: string,
  data: {
    status?: string;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
    notes?: string | null;
  }
) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("build_stages")
    .select("id")
    .eq("project_id", projectId)
    .eq("stage_number", stageNumber)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("build_stages")
      .update(data)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("build_stages").insert({
      project_id: projectId,
      stage_number: stageNumber,
      stage_name: stageName,
      status: data.status ?? "not_started",
      planned_start_date: data.planned_start_date ?? null,
      planned_end_date: data.planned_end_date ?? null,
      actual_start_date: data.actual_start_date ?? null,
      actual_end_date: data.actual_end_date ?? null,
      baseline_start_date: data.planned_start_date ?? null,
      baseline_end_date: data.planned_end_date ?? null,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/projects/${projectId}`);
}

// --- Selections ---

export async function createSelection(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("selections").insert({
    project_id: projectId,
    category: formData.get("category") as string,
    item_name: formData.get("item_name") as string,
    status: (formData.get("status") as string) || "pending",
    notes: (formData.get("notes") as string) || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function updateSelectionStatus(projectId: string, selectionId: string, status: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("selections").update({ status }).eq("id", selectionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteSelection(projectId: string, selectionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("selections").delete().eq("id", selectionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

// --- Field Logs (per-project view) ---

export async function createProjectFieldLog(projectId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("field_logs").insert({
    project_id: projectId,
    log_date: formData.get("log_date") as string,
    notes: formData.get("notes") as string,
    created_by: user.id,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function createProjectFieldTodo(projectId: string, logId: string | null, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProjectTodoStatus(projectId: string, todoId: string, status: string) {
  const supabase = await createClient();
  const update: Record<string, string | null> = { status };
  if (status === "done") update.resolved_date = new Date().toISOString().split("T")[0];
  else update.resolved_date = null;
  await supabase.from("field_todos").update(update).eq("id", todoId);
  revalidatePath(`/projects/${projectId}`);
}
