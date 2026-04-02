// @ts-nocheck
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// updateProject
// ---------------------------------------------------------------------------
export interface UpdateHomeInput {
  name: string;
  address: string;
  subdivision: string;
  block: string;
  lot: string;
  lot_size_acres: string;
  plan: string;
  home_size_sf: string;
  start_date: string;
  lender_id: string;
  status: string;
}

export interface UpdateLandInput {
  name: string;
  address: string;
  size_acres: string;
  number_of_lots: string;
  number_of_phases: string;
  start_date: string;
  lender_id: string;
  status: string;
}

export async function updateHomeProject(
  id: string,
  input: UpdateHomeInput
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      name: input.name.trim(),
      address: input.address.trim() || null,
      subdivision: input.subdivision.trim() || null,
      block: input.block.trim() || null,
      lot: input.lot.trim() || null,
      lot_size_acres: input.lot_size_acres ? parseFloat(input.lot_size_acres) : null,
      plan: input.plan.trim() || null,
      home_size_sf: input.home_size_sf ? parseInt(input.home_size_sf, 10) : null,
      start_date: input.start_date || null,
      lender_id: input.lender_id || null,
      status: (input.status || undefined) as "planning" | "active" | "on_hold" | "completed" | "cancelled" | undefined,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${id}`);
  return {};
}

export async function updateLandProject(
  id: string,
  input: UpdateLandInput
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      name: input.name.trim(),
      address: input.address.trim() || null,
      size_acres: input.size_acres ? parseFloat(input.size_acres) : null,
      number_of_lots: input.number_of_lots ? parseInt(input.number_of_lots, 10) : null,
      number_of_phases: input.number_of_phases ? parseInt(input.number_of_phases, 10) : null,
      start_date: input.start_date || null,
      lender_id: input.lender_id || null,
      status: (input.status || undefined) as "planning" | "active" | "on_hold" | "completed" | "cancelled" | undefined,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${id}`);
  return {};
}

// ---------------------------------------------------------------------------
// ensureLoan — create a loan for this project if none exists with that number
// ---------------------------------------------------------------------------
export async function ensureLoan(
  projectId: string,
  loanNumber: string,
  lenderId: string
): Promise<{ error?: string; created?: boolean }> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("loans")
    .select("id")
    .eq("project_id", projectId)
    .eq("loan_number", loanNumber.trim())
    .maybeSingle();

  if (existing) return { created: false };

  const { error } = await supabase.from("loans").insert({
    project_id: projectId,
    lender_id: lenderId,
    loan_number: loanNumber.trim(),
    loan_amount: 0,
    status: "active",
  });
  if (error) return { error: error.message };
  return { created: true };
}

// ---------------------------------------------------------------------------
// deleteProject
// ---------------------------------------------------------------------------
export async function deleteProject(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/projects");
  redirect("/projects");
}

// ---------------------------------------------------------------------------
// updatePhaseLotsSold
// ---------------------------------------------------------------------------
export async function updatePhaseLotsSold(
  phaseId: string,
  lotsSold: number,
  projectId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_phases")
    .update({ lots_sold: lotsSold })
    .eq("id", phaseId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---------------------------------------------------------------------------
// saveDocument — called after successful Supabase Storage upload
// ---------------------------------------------------------------------------
export async function saveDocument(data: {
  projectId: string;
  folder: string;
  fileName: string;
  storagePath: string;
  fileSizeKb: number;
  mimeType: string;
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      project_id: data.projectId,
      folder: data.folder,
      file_name: data.fileName,
      storage_path: data.storagePath,
      file_size_kb: data.fileSizeKb,
      mime_type: data.mimeType,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath(`/projects/${data.projectId}`);
  return { id: doc.id };
}

// ---------------------------------------------------------------------------
// addProjectCostCode — add a master cost code to a project
// ---------------------------------------------------------------------------
export async function addProjectCostCode(
  projectId: string,
  costCodeId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("project_cost_codes").insert({
    project_id: projectId,
    cost_code_id: costCodeId,
    budgeted_amount: 0,
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---------------------------------------------------------------------------
// updateCostCodeBudget — edit the budgeted_amount for a project cost code
// ---------------------------------------------------------------------------
export async function updateCostCodeBudget(
  pccId: string,
  amount: number
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_cost_codes")
    .update({ budgeted_amount: amount })
    .eq("id", pccId);
  if (error) return { error: error.message };
  return {};
}

// ---------------------------------------------------------------------------
// removeProjectCostCode — remove a cost code from a project
// ---------------------------------------------------------------------------
export async function removeProjectCostCode(
  pccId: string,
  projectId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_cost_codes")
    .delete()
    .eq("id", pccId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---------------------------------------------------------------------------
// createPhase
// ---------------------------------------------------------------------------
export async function createPhase(
  projectId: string,
  data: {
    phase_number?: number;
    name: string;
    size_acres?: number | null;
    number_of_lots?: number | null;
    lots_sold?: number | null;
    status: string;
    notes?: string | null;
  }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("project_phases").insert({
    project_id: projectId,
    phase_number: data.phase_number ?? null,
    name: data.name.trim(),
    size_acres: data.size_acres ?? null,
    number_of_lots: data.number_of_lots ?? null,
    lots_sold: data.lots_sold ?? 0,
    status: data.status,
    notes: data.notes?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---------------------------------------------------------------------------
// updatePhase
// ---------------------------------------------------------------------------
export async function updatePhase(
  phaseId: string,
  projectId: string,
  data: {
    phase_number?: number | null;
    name?: string;
    size_acres?: number | null;
    number_of_lots?: number | null;
    lots_sold?: number | null;
    status?: string;
    notes?: string | null;
  }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_phases")
    .update({
      phase_number: data.phase_number ?? null,
      name: data.name?.trim(),
      size_acres: data.size_acres ?? null,
      number_of_lots: data.number_of_lots ?? null,
      lots_sold: data.lots_sold ?? null,
      status: data.status,
      notes: data.notes?.trim() || null,
    })
    .eq("id", phaseId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---------------------------------------------------------------------------
// deletePhase
// ---------------------------------------------------------------------------
export async function deletePhase(
  phaseId: string,
  projectId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_phases")
    .delete()
    .eq("id", phaseId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// ---------------------------------------------------------------------------
// deleteDocument
// ---------------------------------------------------------------------------
export async function deleteDocument(
  docId: string,
  storagePath: string,
  projectId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Delete from storage
  const { error: storageErr } = await supabase.storage
    .from("documents")
    .remove([storagePath]);
  if (storageErr) return { error: storageErr.message };

  // Delete DB record
  const { error } = await supabase.from("documents").delete().eq("id", docId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}
