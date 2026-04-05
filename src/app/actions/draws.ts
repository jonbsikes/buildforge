// @ts-nocheck
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
  lenderId: string,
  selectedInvoiceIds?: string[]
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

  // If specific invoices were selected, filter to only those
  const qualifiedRows = selectedInvoiceIds && selectedInvoiceIds.length > 0
    ? invRows.filter((r) => selectedInvoiceIds.includes(r.id))
    : invRows;

  if (qualifiedRows.length === 0) {
    return { error: "No selected invoices qualify for this draw" };
  }

  const invoiceIds = qualifiedRows.map((r) => r.id);
  const total = qualifiedRows.reduce((s, r) => s + (r.amount ?? 0), 0);

  if (total <= 0) {
    return { error: "Draw total must be greater than zero" };
  }

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

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
// deleteDraw
// Only allowed for draft draws. Removes draw_invoices links and the draw itself.
// ---------------------------------------------------------------------------

export async function deleteDraw(drawId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: draw } = await supabase
    .from("loan_draws")
    .select("status")
    .eq("id", drawId)
    .single();

  if (!draw) return { error: "Draw not found" };
  if (draw.status !== "draft") return { error: "Only draft draws can be deleted" };

  // Remove linked invoices first
  const { error: linkErr } = await supabase
    .from("draw_invoices")
    .delete()
    .eq("draw_id", drawId);
  if (linkErr) return { error: linkErr.message };

  // Delete the draw
  const { error } = await supabase
    .from("loan_draws")
    .delete()
    .eq("id", drawId);
  if (error) return { error: error.message };

  revalidatePath("/draws");
  return {};
}

// ---------------------------------------------------------------------------
// submitDraw
// ---------------------------------------------------------------------------

export async function submitDraw(drawId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: draw } = await supabase
    .from("loan_draws")
    .select(`id, draw_number, draw_date, total_amount, status, lender_id, project_id, contacts ( name )`)
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

  // Post JE: Debit Due from Lender (1120), Credit each loan's specific liability account
  // Group draw invoice amounts by project → look up each project's loan → use its COA account
  const lender = draw.contacts as { name: string } | null;
  const lenderName = lender?.name ?? "Unknown Lender";
  const displayName = drawDisplayName(draw.draw_date);

  // Step 1: get all invoices in this draw with their project_ids + amounts
  const { data: drawInvRows } = await supabase
    .from("draw_invoices")
    .select("invoice_id, invoices ( amount, project_id )")
    .eq("draw_id", drawId);

  // Step 2: accumulate amount per project_id
  const projectAmounts = new Map<string, number>();
  for (const di of drawInvRows ?? []) {
    const inv = di.invoices as { amount: number | null; project_id: string | null } | null;
    if (!inv?.project_id || !inv?.amount) continue;
    projectAmounts.set(inv.project_id, (projectAmounts.get(inv.project_id) ?? 0) + inv.amount);
  }

  // Step 3: look up loans for these projects from this lender
  const projectIds = [...projectAmounts.keys()];
  const loanCOAMap = new Map<string, string>(); // project_id → coa_account_id
  if (projectIds.length > 0 && draw.lender_id) {
    const { data: loanRows } = await supabase
      .from("loans")
      .select("project_id, coa_account_id")
      .eq("lender_id", draw.lender_id)
      .in("project_id", projectIds)
      .eq("status", "active");
    for (const loan of loanRows ?? []) {
      if (loan.project_id && loan.coa_account_id) {
        loanCOAMap.set(loan.project_id, loan.coa_account_id);
      }
    }
  }

  // Step 4: group amounts by COA account (some projects may share a COA; unmapped → fall back to 2100)
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number")
    .in("account_number", ["1120", "2100"]);

  const acct1120 = accounts?.find(a => a.account_number === "1120")?.id;
  const fallbackCoaId = accounts?.find(a => a.account_number === "2100")?.id;

  const coaAmounts = new Map<string, number>(); // coa_account_id → credit amount
  let unmappedTotal = 0;
  for (const [projectId, amount] of projectAmounts) {
    const coaId = loanCOAMap.get(projectId);
    if (coaId) {
      coaAmounts.set(coaId, (coaAmounts.get(coaId) ?? 0) + amount);
    } else {
      unmappedTotal += amount;
    }
  }
  // Any amounts not tied to a specific loan COA → generic construction loan payable
  if (unmappedTotal > 0 && fallbackCoaId) {
    coaAmounts.set(fallbackCoaId, (coaAmounts.get(fallbackCoaId) ?? 0) + unmappedTotal);
  }
  // Edge case: no invoices in draw yet, fall back to draw.total_amount on generic account
  if (coaAmounts.size === 0 && fallbackCoaId && draw.total_amount > 0) {
    coaAmounts.set(fallbackCoaId, draw.total_amount);
  }

  if (acct1120 && coaAmounts.size > 0) {
    const { data: je } = await supabase
      .from("journal_entries")
      .insert({
        entry_date: new Date().toISOString().split("T")[0],
        reference: `DRAW-SUB-${drawId.slice(0, 8)}`,
        description: `Draw submitted — ${displayName} — ${lenderName}`,
        status: "posted",
        source_type: "loan_draw",
        source_id: draw.id,
        user_id: user.id,
      })
      .select("id")
      .single();

    if (je) {
      const jeLines: {
        journal_entry_id: string;
        account_id: string;
        project_id: string | null;
        description: string;
        debit: number;
        credit: number;
      }[] = [
        // Single debit: Due from Lender (1120) for full draw total
        {
          journal_entry_id: je.id,
          account_id: acct1120,
          project_id: null,
          description: `Due from Lender — ${displayName} — ${lenderName}`,
          debit: draw.total_amount,
          credit: 0,
        },
      ];

      // Per-loan credits to each specific liability account
      for (const [coaId, creditAmount] of coaAmounts) {
        jeLines.push({
          journal_entry_id: je.id,
          account_id: coaId,
          project_id: null,
          description: `Loan Payable — ${displayName} — ${lenderName}`,
          debit: 0,
          credit: creditAmount,
        });
      }

      await supabase.from("journal_entry_lines").insert(jeLines);
    }
  }

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: draw } = await supabase
    .from("loan_draws")
    .select(`id, draw_number, draw_date, total_amount, status, lender_id, contacts ( name )`)
    .eq("id", drawId)
    .single();

  if (!draw) return { error: "Draw not found" };
  if (draw.status !== "submitted") return { error: "Only submitted draws can be marked as funded" };

  // Step 1: Atomically claim the draw via conditional update (prevents race condition).
  // If another request already moved status away from 'submitted', this returns 0 rows.
  const { data: updated, error: claimErr } = await supabase
    .from("loan_draws")
    .update({ status: "funded" })
    .eq("id", drawId)
    .eq("status", "submitted")
    .select("id");

  if (claimErr) return { error: claimErr.message };
  if (!updated || updated.length === 0) {
    return { error: "Draw was already funded or modified by another request" };
  }

  // Step 2: Lock invoices in this draw (mark pending_draw = false to prevent re-draw)
  const { data: drawInvoices } = await supabase
    .from("draw_invoices")
    .select("invoice_id")
    .eq("draw_id", drawId);

  const invoiceIds = (drawInvoices ?? []).map((di) => di.invoice_id);
  if (invoiceIds.length > 0) {
    const { error: lockErr } = await supabase
      .from("invoices")
      .update({ pending_draw: false })
      .in("id", invoiceIds);

    if (lockErr) return { error: `Failed to lock invoices: ${lockErr.message}` };
  }

  // Step 3: Post JE — Debit Cash (1000), Credit Due from Lender (1120)
  // (Loan payable was already booked at submission)
  const lender = draw.contacts as { name: string } | null;
  const lenderName = lender?.name ?? "Unknown Lender";
  const displayName = drawDisplayName(draw.draw_date);

  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number")
    .in("account_number", ["1000", "1120", "1210", "1230", "2000"]);

  const acct1000 = accounts?.find(a => a.account_number === "1000")?.id;
  const acct1120 = accounts?.find(a => a.account_number === "1120")?.id;
  const acct1210 = accounts?.find(a => a.account_number === "1210")?.id;
  const acct1230 = accounts?.find(a => a.account_number === "1230")?.id;
  const acct2000 = accounts?.find(a => a.account_number === "2000")?.id;

  if (acct1000 && acct1120) {
    const { data: je, error: jeErr } = await supabase
      .from("journal_entries")
      .insert({
        entry_date: new Date().toISOString().split("T")[0],
        reference: `DRAW-FUND-${drawId.slice(0, 8)}`,
        description: `Draw funded — ${displayName} — ${lenderName}`,
        status: "posted",
        source_type: "loan_draw",
        source_id: draw.id,
        user_id: user!.id,
      })
      .select("id")
      .single();

    if (jeErr || !je) return { error: `Draw funded but JE posting failed: ${jeErr?.message}` };

    const { error: lineErr } = await supabase.from("journal_entry_lines").insert([
      {
        journal_entry_id: je.id,
        account_id: acct1000,
        project_id: draw.project_id ?? null,
        description: `Cash received — ${displayName} — ${lenderName}`,
        debit: draw.total_amount,
        credit: 0,
      },
      {
        journal_entry_id: je.id,
        account_id: acct1120,
        project_id: draw.project_id ?? null,
        description: `Clear Due from Lender — ${displayName} — ${lenderName}`,
        debit: 0,
        credit: draw.total_amount,
      },
    ]);

    if (lineErr) return { error: `Draw funded but JE lines failed: ${lineErr.message}` };
  }

  // Step 3b: Post WIP/AP JEs — one DR line per invoice (1210 WIP or 1230 CIP-Land),
  // single CR to AP (2000).  This establishes the liability so vendor payment
  // entries (DR AP / CR Cash) balance correctly.
  if (acct1210 && acct1230 && acct2000) {
    const { data: drawInvoiceDetails } = await supabase
      .from("draw_invoices")
      .select(`
        invoice_id,
        invoices (
          id, amount, vendor, invoice_number, project_id,
          projects ( project_type )
        )
      `)
      .eq("draw_id", drawId);

    const wipLines: {
      journal_entry_id: string;
      account_id: string;
      project_id: string | null;
      description: string;
      debit: number;
      credit: number;
    }[] = [];
    let totalWip = 0;

    for (const di of drawInvoiceDetails ?? []) {
      const inv = di.invoices as {
        id: string;
        amount: number | null;
        vendor: string | null;
        invoice_number: string | null;
        project_id: string | null;
        projects: { project_type: string } | null;
      } | null;
      if (!inv || !inv.amount) continue;

      const isLandDev = inv.projects?.project_type === "land_development";
      const wipAcctId = isLandDev ? acct1230 : acct1210;
      const invLabel = [inv.vendor, inv.invoice_number].filter(Boolean).join(" — Inv #");

      wipLines.push({
        journal_entry_id: "", // filled in after JE insert
        account_id: wipAcctId,
        project_id: inv.project_id ?? null,
        description: invLabel || "Construction cost",
        debit: inv.amount,
        credit: 0,
      });
      totalWip += inv.amount;
    }

    if (wipLines.length > 0 && totalWip > 0) {
      const { data: wipJe } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: new Date().toISOString().split("T")[0],
          reference: `DRAW-WIP-${drawId.slice(0, 8)}`,
          description: `Construction costs — ${displayName} — ${lenderName}`,
          status: "posted",
          source_type: "loan_draw",
          source_id: draw.id,
          user_id: user!.id,
        })
        .select("id")
        .single();

      if (wipJe) {
        const lines = wipLines.map(l => ({ ...l, journal_entry_id: wipJe.id }));
        // Single AP credit for the draw total
        lines.push({
          journal_entry_id: wipJe.id,
          account_id: acct2000,
          project_id: null,
          description: `Accounts Payable — ${displayName} — ${lenderName}`,
          debit: 0,
          credit: totalWip,
        });
        await supabase.from("journal_entry_lines").insert(lines);
      }
    }
  }

  // Step 4: Create vendor_payment records (one per vendor) so the user can
  // write individual checks and mark them paid.
  const { data: allDrawInvoices } = await supabase
    .from("draw_invoices")
    .select(`invoice_id, invoices ( id, vendor, vendor_id, amount )`)
    .eq("draw_id", drawId);

  type VendorGroup = {
    vendor_id: string | null;
    vendor_name: string;
    amount: number;
    invoice_ids: string[];
  };

  const vendorMap = new Map<string, VendorGroup>();
  for (const di of allDrawInvoices ?? []) {
    const inv = di.invoices as {
      id: string;
      vendor: string | null;
      vendor_id: string | null;
      amount: number | null;
    } | null;
    if (!inv) continue;
    // Key by vendor_id when available, otherwise by name to group correctly.
    const key = inv.vendor_id ?? `name:${inv.vendor ?? "Unknown"}`;
    if (!vendorMap.has(key)) {
      vendorMap.set(key, {
        vendor_id: inv.vendor_id ?? null,
        vendor_name: inv.vendor ?? "Unknown Vendor",
        amount: 0,
        invoice_ids: [],
      });
    }
    const g = vendorMap.get(key)!;
    g.amount += inv.amount ?? 0;
    g.invoice_ids.push(inv.id);
  }

  for (const [, group] of vendorMap) {
    const { data: vp } = await supabase
      .from("vendor_payments")
      .insert({
        draw_id: drawId,
        vendor_id: group.vendor_id,
        vendor_name: group.vendor_name,
        amount: group.amount,
        status: "pending",
      })
      .select("id")
      .single();

    if (vp) {
      await supabase
        .from("vendor_payment_invoices")
        .insert(
          group.invoice_ids.map((invoice_id) => ({
            vendor_payment_id: vp.id,
            invoice_id,
          }))
        );
    }
  }

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: draw } = await supabase
    .from("loan_draws")
    .select("status, draw_date, draw_number, lender_id, contacts ( name )")
    .eq("id", drawId)
    .single();

  if (!draw) return { error: "Draw not found" };
  if (draw.status !== "funded") return { error: "Only funded draws can be marked as paid" };

  // Get all invoices in this draw with vendor info for GL posting
  const { data: drawInvoiceDetails } = await supabase
    .from("draw_invoices")
    .select("invoice_id, invoices ( id, amount, vendor, invoice_number, project_id )")
    .eq("draw_id", drawId);

  const today = new Date().toISOString().split("T")[0];
  const invoiceIds = (drawInvoiceDetails ?? []).map((di) => di.invoice_id);

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

  // Post GL entry: Dr AP (2000) / Cr Cash (1000) for the full draw total, per project
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number")
    .in("account_number", ["1000", "2000"]);

  const acct1000 = accounts?.find(a => a.account_number === "1000")?.id;
  const acct2000 = accounts?.find(a => a.account_number === "2000")?.id;
  const lenderName = (draw.contacts as { name: string } | null)?.name ?? "Lender";
  const displayName = drawDisplayName(draw.draw_date);

  if (acct1000 && acct2000 && drawInvoiceDetails && drawInvoiceDetails.length > 0) {
    const totalAmount = drawInvoiceDetails.reduce((s, di) => {
      const inv = di.invoices as { amount: number | null } | null;
      return s + (inv?.amount ?? 0);
    }, 0);

    const { data: je } = await supabase
      .from("journal_entries")
      .insert({
        entry_date: today,
        reference: `DRAW-PAID-${drawId.slice(0, 8)}`,
        description: `Draw paid — ${displayName} — ${lenderName}`,
        status: "posted",
        source_type: "invoice_payment",
        source_id: drawId,
        user_id: user.id,
      })
      .select("id")
      .single();

    if (je) {
      await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: je.id,
          account_id: acct2000,
          project_id: null,
          description: `AP cleared — ${displayName} — ${lenderName}`,
          debit: totalAmount,
          credit: 0,
        },
        {
          journal_entry_id: je.id,
          account_id: acct1000,
          project_id: null,
          description: `Cash — ${displayName} — ${lenderName}`,
          debit: 0,
          credit: totalAmount,
        },
      ]);
    }
  }

  revalidatePath("/draws");
  revalidatePath(`/draws/${drawId}`);
  return {};
}

// ---------------------------------------------------------------------------
// markVendorPaymentPaid
// Called when the user writes a check to a vendor and records the check
// number / date.  Posts a GL entry (Dr AP / Cr Cash) and marks the vendor's
// invoices as paid.  When every vendor payment for the draw is paid the draw
// is automatically closed.
// ---------------------------------------------------------------------------

export async function markVendorPaymentPaid(
  vendorPaymentId: string,
  checkNumber: string,
  paymentDate: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Load the vendor payment record
  const { data: vp } = await supabase
    .from("vendor_payments")
    .select("id, draw_id, vendor_name, amount, status")
    .eq("id", vendorPaymentId)
    .single();

  if (!vp) return { error: "Vendor payment not found" };
  if (vp.status === "paid") return { error: "This vendor has already been paid" };

  if (!paymentDate) return { error: "Payment date is required" };

  // Mark the vendor payment record as paid
  const { error: vpErr } = await supabase
    .from("vendor_payments")
    .update({
      status: "paid",
      check_number: checkNumber?.trim() || null,
      payment_date: paymentDate,
    })
    .eq("id", vendorPaymentId);

  if (vpErr) return { error: vpErr.message };

  // Get all invoices linked to this vendor payment
  const { data: links } = await supabase
    .from("vendor_payment_invoices")
    .select("invoice_id")
    .eq("vendor_payment_id", vendorPaymentId);

  const invoiceIds = (links ?? []).map((l) => l.invoice_id);

  // Mark invoices as paid
  if (invoiceIds.length > 0) {
    const { error: invErr } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        payment_date: paymentDate,
        payment_method: "check",
      })
      .in("id", invoiceIds);
    if (invErr) return { error: invErr.message };
  }

  // Post GL entry: Dr Accounts Payable (2000) / Cr Cash (1000)
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number")
    .in("account_number", ["1000", "2000"]);

  const acct1000 = accounts?.find((a) => a.account_number === "1000")?.id;
  const acct2000 = accounts?.find((a) => a.account_number === "2000")?.id;

  const checkRef = checkNumber?.trim()
    ? `Check #${checkNumber.trim()}`
    : `VPmt-${vendorPaymentId.slice(0, 8)}`;

  if (acct1000 && acct2000) {
    const { data: je } = await supabase
      .from("journal_entries")
      .insert({
        entry_date: paymentDate,
        reference: checkRef,
        description: `Check payment — ${vp.vendor_name}`,
        status: "posted",
        source_type: "invoice_payment",
        source_id: vendorPaymentId,
        user_id: user.id,
      })
      .select("id")
      .single();

    if (je) {
      await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: je.id,
          account_id: acct2000,
          project_id: null,
          description: `AP cleared — ${vp.vendor_name}`,
          debit: vp.amount,
          credit: 0,
        },
        {
          journal_entry_id: je.id,
          account_id: acct1000,
          project_id: null,
          description: `${checkRef} — ${vp.vendor_name}`,
          debit: 0,
          credit: vp.amount,
        },
      ]);
    }
  }

  // If every vendor payment for this draw is now paid → auto-close the draw
  const { data: allVps } = await supabase
    .from("vendor_payments")
    .select("status")
    .eq("draw_id", vp.draw_id);

  const allPaid = (allVps ?? []).every((v) => v.status === "paid");
  if (allPaid) {
    await supabase
      .from("loan_draws")
      .update({ status: "paid" })
      .eq("id", vp.draw_id);
  }

  revalidatePath(`/draws/${vp.draw_id}`);
  revalidatePath("/draws");
  return {};
}

// ---------------------------------------------------------------------------
// adjustVendorPaymentAmount
// Applies a positive or negative dollar adjustment to a pending vendor payment
// (e.g. to account for a vendor credit or disputed amount).  The resulting
// amount must be >= 0.  Cannot adjust a payment that is already paid.
// ---------------------------------------------------------------------------

export async function adjustVendorPaymentAmount(
  vendorPaymentId: string,
  adjustment: number,
  description: string
): Promise<{ error?: string; newAmount?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (adjustment === 0) return { error: "Adjustment cannot be zero" };
  if (!description?.trim()) return { error: "Description is required" };

  const { data: vp } = await supabase
    .from("vendor_payments")
    .select("id, draw_id, amount, status")
    .eq("id", vendorPaymentId)
    .single();

  if (!vp) return { error: "Vendor payment not found" };
  if (vp.status === "paid") return { error: "Cannot adjust an already-paid vendor payment" };

  const newAmount = Math.round(((vp.amount ?? 0) + adjustment) * 100) / 100;
  if (newAmount < 0) {
    return { error: "Adjustment would result in a negative amount" };
  }

  // Insert the adjustment line item record
  const { error: adjErr } = await supabase
    .from("vendor_payment_adjustments")
    .insert({
      vendor_payment_id: vendorPaymentId,
      description: description.trim(),
      amount: adjustment,
    });

  if (adjErr) return { error: adjErr.message };

  // Keep the parent amount in sync
  const { error } = await supabase
    .from("vendor_payments")
    .update({ amount: newAmount })
    .eq("id", vendorPaymentId);

  if (error) return { error: error.message };

  // Post GL entry for the adjustment
  // Get all invoices linked to this vendor payment to determine project_id and project_type
  const { data: links } = await supabase
    .from("vendor_payment_invoices")
    .select(`
      invoice_id,
      invoices (
        id, project_id,
        projects ( project_type )
      )
    `)
    .eq("vendor_payment_id", vendorPaymentId);

  // Determine project_id from first linked invoice
  let projectId: string | null = null;
  let isLandDev = false;
  if ((links ?? []).length > 0) {
    const firstInvoice = (links![0] as any)?.invoices;
    if (firstInvoice) {
      projectId = firstInvoice.project_id ?? null;
      isLandDev = firstInvoice.projects?.project_type === "land_development";
    }
  }

  // Fetch chart of accounts
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number")
    .in("account_number", ["1210", "1230", "2000"]);

  const acct1210 = accounts?.find(a => a.account_number === "1210")?.id;
  const acct1230 = accounts?.find(a => a.account_number === "1230")?.id;
  const acct2000 = accounts?.find(a => a.account_number === "2000")?.id;

  if (acct1210 && acct1230 && acct2000) {
    const wipAcctId = isLandDev ? acct1230 : acct1210;
    const adjustmentAbsolute = Math.abs(adjustment);

    // Create journal entry for the adjustment
    const { data: je, error: jeErr } = await supabase
      .from("journal_entries")
      .insert({
        entry_date: new Date().toISOString().split("T")[0],
        reference: `ADJ-VP-${vendorPaymentId.slice(0, 8)}`,
        description: `Vendor payment adjustment — ${description}`,
        status: "posted",
        source_type: "vendor_adjustment",
        source_id: vendorPaymentId,
        user_id: user.id,
      })
      .select("id")
      .single();

    if (je) {
      let jeLines: {
        journal_entry_id: string;
        account_id: string;
        project_id: string | null;
        description: string;
        debit: number;
        credit: number;
      }[] = [];

      if (adjustment < 0) {
        // Negative adjustment (credit) — reduces what we owe
        // DR Accounts Payable (2000), CR WIP (1210 or 1230)
        jeLines = [
          {
            journal_entry_id: je.id,
            account_id: acct2000,
            project_id: projectId,
            description: `Vendor credit — ${description}`,
            debit: adjustmentAbsolute,
            credit: 0,
          },
          {
            journal_entry_id: je.id,
            account_id: wipAcctId,
            project_id: projectId,
            description: `Vendor credit reversal — ${description}`,
            debit: 0,
            credit: adjustmentAbsolute,
          },
        ];
      } else {
        // Positive adjustment (additional charge) — increases what we owe
        // DR WIP (1210 or 1230), CR Accounts Payable (2000)
        jeLines = [
          {
            journal_entry_id: je.id,
            account_id: wipAcctId,
            project_id: projectId,
            description: `Additional vendor charge — ${description}`,
            debit: adjustmentAbsolute,
            credit: 0,
          },
          {
            journal_entry_id: je.id,
            account_id: acct2000,
            project_id: projectId,
            description: `Additional vendor liability — ${description}`,
            debit: 0,
            credit: adjustmentAbsolute,
          },
        ];
      }

      const { error: lineErr } = await supabase
        .from("journal_entry_lines")
        .insert(jeLines);

      if (lineErr) {
        console.error(`Adjustment JE lines failed: ${lineErr.message}`);
      }
    } else if (jeErr) {
      console.error(`Adjustment JE creation failed: ${jeErr.message}`);
    }
  }

  revalidatePath(`/draws/${vp.draw_id}`);
  return { newAmount };
}

// ---------------------------------------------------------------------------
// deleteVendorPaymentAdjustment
// Removes an adjustment line item and reverses its effect on the vendor
// payment total.  Only allowed while the vendor payment is still pending.
// ---------------------------------------------------------------------------

export async function deleteVendorPaymentAdjustment(
  adjustmentId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Load the adjustment so we can reverse its amount
  const { data: adj } = await supabase
    .from("vendor_payment_adjustments")
    .select("id, vendor_payment_id, amount")
    .eq("id", adjustmentId)
    .single();

  if (!adj) return { error: "Adjustment not found" };

  // Guard: don't allow deletion once the vendor has been paid
  const { data: vp } = await supabase
    .from("vendor_payments")
    .select("id, draw_id, amount, status")
    .eq("id", adj.vendor_payment_id)
    .single();

  if (!vp) return { error: "Vendor payment not found" };
  if (vp.status === "paid") return { error: "Cannot delete an adjustment after the vendor has been paid" };

  // Delete the adjustment record
  const { error: delErr } = await supabase
    .from("vendor_payment_adjustments")
    .delete()
    .eq("id", adjustmentId);

  if (delErr) return { error: delErr.message };

  // Reverse the adjustment from the vendor payment total
  const newAmount = Math.round(((vp.amount ?? 0) - adj.amount) * 100) / 100;
  const { error: updErr } = await supabase
    .from("vendor_payments")
    .update({ amount: newAmount })
    .eq("id", adj.vendor_payment_id);

  if (updErr) return { error: updErr.message };

  revalidatePath(`/draws/${vp.draw_id}`);
  return {};
}
