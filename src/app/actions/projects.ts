"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { mintLoanCoaAccount } from "./banking";

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const loanNum = loanNumber.trim();

  const { data: existing } = await supabase
    .from("loans")
    .select("id")
    .eq("project_id", projectId)
    .eq("loan_number", loanNum)
    .maybeSingle();

  if (existing) return { created: false };

  // Mint the per-loan COA account first so fundDraw has somewhere to post.
  const coa = await mintLoanCoaAccount(supabase, projectId, loanNum);
  if (coa.error || !coa.coaAccountId) {
    return { error: coa.error ?? "Failed to create COA account for loan" };
  }

  const { error } = await supabase.from("loans").insert({
    project_id: projectId,
    lender_id: lenderId,
    loan_number: loanNum,
    loan_amount: 0,
    loan_type: "term_loan",
    status: "active",
    coa_account_id: coa.coaAccountId,
  });
  if (error) {
    await supabase.from("chart_of_accounts").delete().eq("id", coa.coaAccountId);
    return { error: error.message };
  }
  return { created: true };
}

// ---------------------------------------------------------------------------
// deleteProject
// ---------------------------------------------------------------------------
export async function deleteProject(id: string): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
// addProjectCostCodes — bulk-add multiple cost codes to a project
// ---------------------------------------------------------------------------
export async function addProjectCostCodes(
  projectId: string,
  costCodeIds: string[]
): Promise<{ error?: string }> {
  if (!costCodeIds.length) return {};

  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const rows = costCodeIds.map((costCodeId) => ({
    project_id: projectId,
    cost_code_id: costCodeId,
    budgeted_amount: 0,
  }));
  const { error } = await supabase.from("project_cost_codes").insert(rows);
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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
    lots_sold?: number;
    status?: string;
    notes?: string | null;
  }
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_phases")
    .update({
      phase_number: data.phase_number ?? null,
      name: data.name?.trim(),
      size_acres: data.size_acres ?? null,
      number_of_lots: data.number_of_lots ?? null,
      lots_sold: data.lots_sold,
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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
// getInvoicesForCostCode
// Returns invoices for a specific project + cost code, used for the cost items
// drill-down in the Cost Items tab.
// ---------------------------------------------------------------------------
export interface CostCodeInvoice {
  id: string;
  invoice_number: string | null;
  vendor: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number | null;
  status: string | null;
  pending_draw: boolean | null;
}

export async function getInvoicesForCostCode(
  projectId: string,
  costCodeId: string
): Promise<{ error?: string; invoices?: CostCodeInvoice[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Look up the cost code number from the UUID
  const { data: ccRow } = await supabase
    .from("cost_codes")
    .select("code")
    .eq("id", costCodeId)
    .single();
  const costCodeNum = ccRow?.code ?? costCodeId;

  // Find invoices via line items attributed to this project + cost code
  const { data: lineItems, error: liErr } = await supabase
    .from("invoice_line_items")
    .select("invoice_id, amount")
    .eq("project_id", projectId)
    .eq("cost_code", costCodeNum);

  if (liErr) return { error: liErr.message };

  const invoiceIds = [...new Set((lineItems ?? []).map((li) => li.invoice_id))];
  if (invoiceIds.length === 0) return { invoices: [] };

  // Build line-item amount per invoice (amount attributed to THIS project+code)
  const liAmountByInvoice: Record<string, number> = {};
  for (const li of lineItems ?? []) {
    liAmountByInvoice[li.invoice_id] = (liAmountByInvoice[li.invoice_id] ?? 0) + (li.amount ?? 0);
  }

  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, vendor, invoice_date, due_date, amount, status, pending_draw")
    .in("id", invoiceIds)
    .not("status", "in", "(void,disputed)")
    .order("invoice_date", { ascending: false });

  // Replace invoice.amount with the line-item amount for this project+code
  const adjusted = (data ?? []).map((inv) => ({
    ...inv,
    amount: liAmountByInvoice[inv.id] ?? inv.amount,
  }));

  if (error) return { error: error.message };
  return { invoices: adjusted as CostCodeInvoice[] };
}

// ---------------------------------------------------------------------------
// Selections (Home Construction projects only)
// ---------------------------------------------------------------------------

export async function createSelection(projectId: string, formData: FormData) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error ?? "Not authorized");

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

export async function updateSelectionStatus(
  projectId: string,
  selectionId: string,
  status: string
) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error ?? "Not authorized");

  const supabase = await createClient();
  const { error } = await supabase
    .from("selections")
    .update({ status })
    .eq("id", selectionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteSelection(projectId: string, selectionId: string) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error ?? "Not authorized");

  const supabase = await createClient();
  const { error } = await supabase
    .from("selections")
    .delete()
    .eq("id", selectionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// deleteDocument
// ---------------------------------------------------------------------------
export async function deleteDocument(
  docId: string,
  storagePath: string,
  projectId: string
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();

  // DB record FIRST — if DB fails, an orphaned storage file is recoverable;
  // a dangling DB pointer to a deleted file shows as a broken document in the UI.
  const { error } = await supabase.from("documents").delete().eq("id", docId);
  if (error) return { error: error.message };

  // Storage second. A failure here leaks the file but the UI is consistent.
  const { error: storageErr } = await supabase.storage
    .from("documents")
    .remove([storagePath]);
  if (storageErr) return { error: storageErr.message };

  revalidatePath(`/projects/${projectId}`);
  return {};
}
