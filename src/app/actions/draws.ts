"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { drawDisplayName } from "@/lib/draws";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DrawableInvoice {
  id: string;
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number | null;
  file_name: string | null;
  project: {
    id: string;
    name: string;
    address: string | null;
    lender_id: string | null;
    lender_name: string | null;
  } | null;
  cost_code: string | null;
  loan_number: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns IDs of invoices already linked to a funded or paid draw
 * (they should not be re-drawn).
 */
async function getLockedInvoiceIds(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string[]> {
  const { data: closedDraws } = await supabase
    .from("loan_draws")
    .select("id")
    .in("status", ["funded", "paid"]);

  const closedIds = (closedDraws ?? []).map((d) => d.id);
  if (closedIds.length === 0) return [];

  const { data: linked } = await supabase
    .from("draw_invoices")
    .select("invoice_id")
    .in("draw_id", closedIds);

  return (linked ?? []).map((r) => r.invoice_id);
}

// ---------------------------------------------------------------------------
// getDrawableInvoices
// ---------------------------------------------------------------------------

export async function getDrawableInvoices(): Promise<{
  error?: string;
  invoices?: DrawableInvoice[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const lockedIds = await getLockedInvoiceIds(supabase);

  let query = supabase
    .from("invoices")
    .select(`
      id, vendor, invoice_number, invoice_date, due_date, amount, file_name,
      projects ( id, name, address, lender_id, contacts ( id, name ) ),
      cost_codes ( code )
    `)
    .eq("status", "approved")
    .eq("pending_draw", true)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (lockedIds.length > 0) {
    query = query.not("id", "in", `(${lockedIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = data ?? [];
  const projectIds = [
    ...new Set(
      rows
        .map((r) => (r.projects as { id: string } | null)?.id)
        .filter(Boolean) as string[]
    ),
  ];

  const loanByProject = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: loanRows } = await supabase
      .from("loans")
      .select("project_id, loan_number, created_at")
      .in("project_id", projectIds)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    for (const l of loanRows ?? []) {
      if (!loanByProject.has(l.project_id)) {
        loanByProject.set(l.project_id, l.loan_number);
      }
    }
  }

  const invoices: DrawableInvoice[] = rows.map((row) => {
    const proj = row.projects as {
      id: string;
      name: string;
      address: string | null;
      lender_id: string | null;
      contacts: { id: string; name: string } | null;
    } | null;
    const cc = row.cost_codes as { code: string } | null;

    return {
      id: row.id,
      vendor: row.vendor,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      amount: row.amount,
      file_name: row.file_name,
      project: proj
        ? {
            id: proj.id,
            name: proj.name,
            address: proj.address ?? null,
            lender_id: proj.lender_id,
            lender_name: proj.contacts?.name ?? null,
          }
        : null,
      cost_code: cc?.code ?? null,
      loan_number: proj?.id ? (loanByProject.get(proj.id) ?? null) : null,
    };
  });

  return { invoices };
}

// ---------------------------------------------------------------------------
// createDraw
// Server-side: queries all qualifying invoices for the lender automatically.
// ---------------------------------------------------------------------------

export async function createDraw(
  lenderId: string
): Promise<{ error?: string; drawId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Find project IDs with active loans from this lender
  const { data: lenderLoans, error: loansErr } = await supabase
    .from("loans")
    .select("project_id")
    .eq("lender_id", lenderId)
    .eq("status", "active");
  if (loansErr) return { error: loansErr.message };

  const projectIds = (lenderLoans ?? []).map((l) => l.project_id);
  if (projectIds.length === 0) return { error: "No active loans found for this lender" };

  // Exclude invoices already in funded/paid draws
  const lockedIds = await getLockedInvoiceIds(supabase);

  let invQuery = supabase
    .from("invoices")
    .select("id, amount")
    .eq("status", "approved")
    .eq("pending_draw", true)
    .in("project_id", projectIds);

  if (lockedIds.length > 0) {
    invQuery = invQuery.not("id", "in", `(${lockedIds.join(",")})`);
  }

  const { data: invRows, error: invErr } = await invQuery;
  if (invErr) return { error: invErr.message };
  if (!invRows || invRows.length === 0) {
    return { error: "No qualifying invoices found for this lender" };
  }

  const invoiceIds = invRows.map((r) => r.id);
  const total = invRows.reduce((s, r) => s + (r.amount ?? 0), 0);

  // Next draw number
  const { data: maxRow } = await supabase
    .from("loan_draws")
    .select("draw_number")
    .order("draw_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const drawNumber = (maxRow?.draw_number ?? 0) + 1;

  const drawDate = new Date().toISOString().split("T")[0];

  const { data: draw, error: drawErr } = await supabase
    .from("loan_draws")
    .insert({
      lender_id: lenderId,
      loan_id: null,
      project_id: null,
      draw_number: drawNumber,
      draw_date: drawDate,
      total_amount: total,
      status: "draft",
    })
    .select("id")
    .single();

  if (drawErr || !draw) return { error: drawErr?.message ?? "Failed to create draw" };

  const { error: linkErr } = await supabase
    .from("draw_invoices")
    .insert(invoiceIds.map((id) => ({ draw_id: draw.id, invoice_id: id })));
  if (linkErr) return { error: linkErr.message };

  revalidatePath("/draws");
  return { drawId: draw.id };
}

// ---------------------------------------------------------------------------
// removeInvoiceFromDraw
// Allowed for any draw that is not paid.
// ---------------------------------------------------------------------------

export async function removeInvoiceFromDraw(
  drawId: string,
  invoiceId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: draw } = await supabase
    .from("loan_draws")
    .select("status, total_amount")
    .eq("id", drawId)
    .single();

  if (!draw) return { error: "Draw not found" };
  if (draw.status === "paid") return { error: "Cannot modify a paid draw" };

  const { error } = await supabase
    .from("draw_invoices")
    .delete()
    .eq("draw_id", drawId)
    .eq("invoice_id", invoiceId);

  if (error) return { error: error.message };

  // Recalculate total
  const { data: remaining } = await supabase
    .from("draw_invoices")
    .select("invoices ( amount )")
    .eq("draw_id", drawId);

  const newTotal = (remaining ?? []).reduce((s, r) => {
    const inv = r.invoices as { amount: number } | null;
    return s + (inv?.amount ?? 0);
  }, 0);

  await supabase
    .from("loan_draws")
    .update({ total_amount: newTotal })
    .eq("id", drawId);

  revalidatePath(`/draws/${drawId}`);
  revalidatePath("/draws");
  return {};
}

// ---------------------------------------------------------------------------
// submitDraw
// ---------------------------------------------------------------------------

export async function submitDraw(drawId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: draw } = await supabase
    .from("loan_draws")
    .select("status")
    .eq("id", drawId)
    .single();

  if (!draw || draw.status !== "draft") {
    return { error: "Only draft draws can be submitted" };
  }

  const { error } = await supabase
    .from("loan_draws")
    .update({ status: "submitted" })
    .eq("id", drawId);

  if (error) return { error: error.message };

  revalidatePath("/draws");
  revalidatePath(`/draws/${drawId}`);
  return {};
}

// ---------------------------------------------------------------------------
// fundDraw
// Posts GL entry (debit Cash / credit Construction Loan Payable).
// ---------------------------------------------------------------------------

export async function fundDraw(drawId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: draw } = await supabase
    .from("loan_draws")
    .select(`id, draw_number, draw_date, total_amount, status, lender_id, contacts ( name )`)
    .eq("id", drawId)
    .single();

  if (!draw) return { error: "Draw not found" };
  if (draw.status !== "submitted") return { error: "Only submitted draws can be marked as funded" };

  const lender = draw.contacts as { name: string } | null;
  const lenderName = lender?.name ?? "Unknown Lender";
  const displayName = drawDisplayName(draw.draw_date);

  const { error: glErr } = await supabase.from("gl_entries").insert({
    entry_date: new Date().toISOString().split("T")[0],
    description: `${displayName} \u2013 ${lenderName}`,
    debit_account: "Cash",
    credit_account: "Construction Loan Payable",
    amount: draw.total_amount,
    source_type: "loan_draw",
    source_id: draw.id,
    project_id: null,
  });

  if (glErr) return { error: glErr.message };

  const { error } = await supabase
    .from("loan_draws")
    .update({ status: "funded" })
    .eq("id", drawId);

  if (error) return { error: error.message };

  revalidatePath("/draws");
  revalidatePath(`/draws/${drawId}`);
  return {};
}

// ---------------------------------------------------------------------------
// markDrawPaid
// Marks the draw as paid and sets all linked invoices to status = 'paid'.
// ---------------------------------------------------------------------------

export async function markDrawPaid(drawId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: draw } = await supabase
    .from("loan_draws")
    .select("status")
    .eq("id", drawId)
    .single();

  if (!draw) return { error: "Draw not found" };
  if (draw.status !== "funded") return { error: "Only funded draws can be marked as paid" };

  // Get all invoice IDs in this draw
  const { data: drawInvoices } = await supabase
    .from("draw_invoices")
    .select("invoice_id")
    .eq("draw_id", drawId);

  const invoiceIds = (drawInvoices ?? []).map((di) => di.invoice_id);
  const today = new Date().toISOString().split("T")[0];

  if (invoiceIds.length > 0) {
    const { error: invErr } = await supabase
      .from("invoices")
      .update({ status: "paid", payment_date: today })
      .in("id", invoiceIds);
    if (invErr) return { error: invErr.message };
  }

  const { error } = await supabase
    .from("loan_draws")
    .update({ status: "paid" })
    .eq("id", drawId);

  if (error) return { error: error.message };

  revalidatePath("/draws");
  revalidatePath(`/draws/${drawId}`);
  return {};
}
