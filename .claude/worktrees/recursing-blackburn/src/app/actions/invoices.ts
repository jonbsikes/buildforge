"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export interface LineItemInput {
  cost_code: string; // text code, e.g. "47"
  description: string;
  amount: number;
}

export interface SaveInvoiceInput {
  // Header
  project_id: string | null;
  vendor_id: string | null;
  vendor_name: string; // for display name construction
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  source: "upload" | "manual";
  file_path: string | null;
  file_name_original: string | null; // original filename, not the display name

  // AI fields
  ai_confidence: "high" | "medium" | "low";
  ai_notes: string;

  // Line items
  line_items: LineItemInput[];

  // Derived from line items
  project_name: string; // for display name, "Company" if G&A
}

export async function saveInvoice(
  input: SaveInvoiceInput
): Promise<{ error?: string; invoiceId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (input.line_items.length === 0) return { error: "At least one line item is required" };

  // Calculate total from line items
  const totalAmount = input.line_items.reduce((sum, li) => sum + li.amount, 0);

  // Find dominant cost code (largest line item)
  const dominant = input.line_items.reduce((max, li) => (li.amount > max.amount ? li : max));

  // Look up the UUID for the dominant cost code
  const { data: dominantCode } = await supabase
    .from("cost_codes")
    .select("id, name")
    .eq("code", dominant.cost_code)
    .is("user_id", null)
    .single();

  // Look up vendor name if vendor_id provided
  let vendorDisplay = input.vendor_name.trim() || "Unknown Vendor";

  // Build display name: Vendor – Code – Project – Invoice#
  const displayName = [
    vendorDisplay,
    dominant.cost_code,
    input.project_name || "Company",
    input.invoice_number || "—",
  ].join(" – ");

  // Default due_date to today if not provided
  const dueDate = input.due_date || new Date().toISOString().split("T")[0];

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      project_id: input.project_id || null,
      vendor_id: input.vendor_id || null,
      vendor: vendorDisplay,
      invoice_number: input.invoice_number || null,
      invoice_date: input.invoice_date || null,
      due_date: dueDate,
      amount: totalAmount,
      total_amount: totalAmount,
      status: "pending_review",
      ai_confidence: input.ai_confidence,
      ai_notes: input.ai_notes || null,
      source: input.source,
      file_path: input.file_path || null,
      file_name: displayName,
      cost_code_id: dominantCode?.id ?? null,
      pending_draw: false,
      manually_reviewed: false,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { error: invoiceError?.message ?? "Failed to save invoice" };
  }

  // Save line items
  if (input.line_items.length > 0) {
    const { error: lineError } = await supabase.from("invoice_line_items").insert(
      input.line_items.map((li) => ({
        invoice_id: invoice.id,
        cost_code: li.cost_code,
        description: li.description || null,
        amount: li.amount,
      }))
    );
    if (lineError) {
      return { error: lineError.message };
    }
  }

  revalidatePath("/invoices");
  return { invoiceId: invoice.id };
}

export async function approveInvoice(
  invoiceId: string
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch current state
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, ai_confidence, manually_reviewed")
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status !== "pending_review") return { error: "Invoice is not in pending_review status" };

  // Low-confidence lock: cannot approve without manual review
  if (invoice.ai_confidence === "low" && !invoice.manually_reviewed) {
    return {
      error:
        "This invoice was flagged as low confidence by AI. Please review and edit at least one field before approving.",
    };
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "approved" })
    .eq("id", invoiceId);

  if (error) return { error: error.message };

  revalidatePath("/invoices");
  return { success: true };
}

export async function setPendingDraw(
  invoiceId: string,
  pending: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ pending_draw: pending })
    .eq("id", invoiceId);

  if (error) return { error: error.message };

  revalidatePath("/invoices");
  return {};
}

export async function markManuallyReviewed(
  invoiceId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ manually_reviewed: true })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  return {};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the invoice is linked to a funded draw (making it locked). */
async function isInFundedDraw(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string
): Promise<boolean> {
  const { data: links } = await supabase
    .from("draw_invoices")
    .select("draw_id")
    .eq("invoice_id", invoiceId);

  const drawIds = (links ?? []).map((l) => l.draw_id);
  if (drawIds.length === 0) return false;

  const { data: funded } = await supabase
    .from("loan_draws")
    .select("id")
    .in("id", drawIds)
    .eq("status", "funded")
    .limit(1);

  return (funded?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// updateInvoice
// ---------------------------------------------------------------------------

export interface UpdateInvoiceInput {
  project_id: string | null;
  vendor_id: string | null;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  pending_draw: boolean;
  status: "pending_review" | "approved" | "disputed";
  payment_method: string;
  line_items: LineItemInput[];
  project_name: string;
  contract_id: string | null;
}

export async function updateInvoice(
  invoiceId: string,
  input: UpdateInvoiceInput
): Promise<{ error?: string }> {
  const supabase = await createClient();

  if (input.line_items.length === 0) return { error: "At least one line item is required" };

  // Lock check
  if (await isInFundedDraw(supabase, invoiceId)) {
    return { error: "This invoice is part of a funded draw and cannot be edited" };
  }

  const totalAmount = input.line_items.reduce((sum, li) => sum + li.amount, 0);
  const dominant = input.line_items.reduce((max, li) => (li.amount > max.amount ? li : max));

  const { data: dominantCode } = await supabase
    .from("cost_codes")
    .select("id")
    .eq("code", dominant.cost_code)
    .is("user_id", null)
    .maybeSingle();

  const vendorDisplay =
    (input.vendor_id
      ? ((await supabase.from("vendors").select("name").eq("id", input.vendor_id).single()).data?.name ?? input.vendor_name.trim())
      : input.vendor_name.trim()) || "Unknown Vendor";

  const displayName = [
    vendorDisplay,
    dominant.cost_code,
    input.project_name || "Company",
    input.invoice_number || "—",
  ].join(" – ");

  const dueDate = input.due_date || new Date().toISOString().split("T")[0];

  const { error: updateErr } = await supabase
    .from("invoices")
    .update({
      project_id: input.project_id || null,
      vendor_id: input.vendor_id || null,
      vendor: vendorDisplay,
      invoice_number: input.invoice_number || null,
      invoice_date: input.invoice_date || null,
      due_date: dueDate,
      amount: totalAmount,
      total_amount: totalAmount,
      file_name: displayName,
      cost_code_id: dominantCode?.id ?? null,
      pending_draw: input.pending_draw,
      status: input.status,
      payment_method: input.payment_method || null,
      contract_id: input.contract_id || null,
      manually_reviewed: true, // editing counts as reviewing
    })
    .eq("id", invoiceId);

  if (updateErr) return { error: updateErr.message };

  // Replace line items
  await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
  const { error: lineErr } = await supabase.from("invoice_line_items").insert(
    input.line_items.map((li) => ({
      invoice_id: invoiceId,
      cost_code: li.cost_code,
      description: li.description || null,
      amount: li.amount,
    }))
  );
  if (lineErr) return { error: lineErr.message };

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return {};
}

// ---------------------------------------------------------------------------
// deleteInvoice
// ---------------------------------------------------------------------------

export async function deleteInvoice(invoiceId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  if (await isInFundedDraw(supabase, invoiceId)) {
    return { error: "This invoice is part of a funded draw and cannot be deleted" };
  }

  // Remove from any draft/submitted draws
  await supabase.from("draw_invoices").delete().eq("invoice_id", invoiceId);

  // Delete line items
  await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId);

  // Delete invoice
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) return { error: error.message };

  revalidatePath("/invoices");
  redirect("/invoices");
}

export async function disputeInvoice(
  invoiceId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "disputed" })
    .eq("id", invoiceId);
  if (error) return { error: error.message };
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return {};
}

export async function advanceInvoiceStatus(
  invoiceId: string,
  to: "scheduled" | "paid",
  paymentDate?: string,
  paymentMethod?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const updates: Record<string, unknown> = { status: to };
  if (to === "paid") {
    updates.payment_date = paymentDate ?? new Date().toISOString().split("T")[0];
    updates.payment_method = paymentMethod ?? null;
  }

  const { error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", invoiceId);

  if (error) return { error: error.message };

  revalidatePath("/invoices");
  return {};
}
