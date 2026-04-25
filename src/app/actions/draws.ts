"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { drawDisplayName } from "@/lib/draws";
import { requireAdmin } from "@/lib/auth";
import { getAccountIdMap } from "@/lib/gl/accounts";
import { postJournalEntry } from "@/lib/gl/postEntry";

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
  // Per-line-item allocation to loans. For single-project invoices this
  // has one entry; for multi-project invoices it has one entry per loan
  // covered by the line items. Sum of amounts equals invoice.amount.
  loan_allocations: { loan_number: string | null; amount: number }[];
  // All project IDs touched by this invoice (header + line items)
  project_ids: string[];
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

  // Load line items so we can allocate per-line-item to the correct loan
  const invoiceIds = rows.map((r) => r.id);
  const lineItemsByInvoice = new Map<string, { project_id: string | null; amount: number | null }[]>();
  if (invoiceIds.length > 0) {
    const { data: liRows } = await supabase
      .from("invoice_line_items")
      .select("invoice_id, project_id, amount")
      .in("invoice_id", invoiceIds);
    for (const li of liRows ?? []) {
      if (!lineItemsByInvoice.has(li.invoice_id)) lineItemsByInvoice.set(li.invoice_id, []);
      lineItemsByInvoice.get(li.invoice_id)!.push({
        project_id: li.project_id ?? null,
        amount: li.amount ?? null,
      });
    }
  }

  // Widen project ID lookup to include line-item projects (may differ from header)
  const allProjectIds = new Set<string>(projectIds);
  for (const items of lineItemsByInvoice.values()) {
    for (const li of items) {
      if (li.project_id) allProjectIds.add(li.project_id);
    }
  }

  const loanByProject = new Map<string, string>();
  if (allProjectIds.size > 0) {
    const { data: loanRows } = await supabase
      .from("loans")
      .select("project_id, loan_number, created_at")
      .in("project_id", Array.from(allProjectIds))
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

    // Build per-loan allocations from line items if any exist; otherwise fall
    // back to a single allocation against the header project's loan.
    const lineItems = lineItemsByInvoice.get(row.id) ?? [];
    const allocMap = new Map<string | null, number>();
    if (lineItems.length > 0) {
      for (const li of lineItems) {
        const amt = li.amount ?? 0;
        if (amt === 0) continue;
        const loanNum = li.project_id ? (loanByProject.get(li.project_id) ?? null) : null;
        allocMap.set(loanNum, (allocMap.get(loanNum) ?? 0) + amt);
      }
    }
    if (allocMap.size === 0) {
      const loanNum = proj?.id ? (loanByProject.get(proj.id) ?? null) : null;
      allocMap.set(loanNum, row.amount ?? 0);
    }
    const loan_allocations = Array.from(allocMap, ([loan_number, amount]) => ({ loan_number, amount }));

    const projectIdSet = new Set<string>();
    if (proj?.id) projectIdSet.add(proj.id);
    for (const li of lineItems) {
      if (li.project_id) projectIdSet.add(li.project_id);
    }

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
      loan_allocations,
      project_ids: Array.from(projectIdSet),
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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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

  // Find invoices that have ANY line item attributed to one of this lender's projects
  // This handles multi-project invoices where the dominant project may differ
  const { data: liRows } = await supabase
    .from("invoice_line_items")
    .select("invoice_id")
    .in("project_id", projectIds);
  const lineItemInvoiceIds = [...new Set((liRows ?? []).map((r) => r.invoice_id))];

  // Also include invoices matched by header project_id (for invoices without line items)
  let invQuery = supabase
    .from("invoices")
    .select("id, amount")
    .eq("status", "approved")
    .eq("pending_draw", true);

  if (lineItemInvoiceIds.length > 0) {
    invQuery = invQuery.or(`project_id.in.(${projectIds.join(",")}),id.in.(${lineItemInvoiceIds.join(",")})`);
  } else {
    invQuery = invQuery.in("project_id", projectIds);
  }

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: draw } = await supabase
    .from("loan_draws")
    .select("status, total_amount")
    .eq("id", drawId)
    .single();

  if (!draw) return { error: "Draw not found" };
  if (draw.status === "funded" || draw.status === "paid") return { error: "Cannot modify a funded or paid draw" };

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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

  // Post JE: DR Due from Lender (1120) / CR Draws Pending Funding (2060)
  //
  // The loan balance must NOT increase at submission — the money hasn't arrived yet.
  // We credit the transitory "Draws Pending Funding" (2060) account instead.
  // When the draw is funded, a second JE clears 2060 into per-loan Loan Payable (220x),
  // which is when the loan balance legitimately increases.
  const lender = draw.contacts as { name: string } | null;
  const lenderName = lender?.name ?? "Unknown Lender";
  const displayName = drawDisplayName(draw.draw_date);

  const accounts = await getAccountIdMap(supabase, ["1120", "2060"]);
  const acct1120 = accounts.get("1120");
  const acct2060 = accounts.get("2060");

  if (acct1120 && acct2060 && draw.total_amount > 0) {
    await postJournalEntry(
      supabase,
      {
        entry_date: new Date().toISOString().split("T")[0],
        reference: `DRAW-SUB-${drawId.slice(0, 8)}`,
        description: `Draw submitted — ${displayName} — ${lenderName}`,
        status: "posted",
        source_type: "loan_draw",
        source_id: draw.id,
        user_id: user.id,
      },
      [
        {
          account_id: acct1120,
          project_id: null,
          description: `Due from Lender — ${displayName} — ${lenderName}`,
          debit: draw.total_amount,
          credit: 0,
        },
        {
          account_id: acct2060,
          project_id: null,
          description: `Draws Pending Funding — ${displayName} — ${lenderName}`,
          debit: 0,
          credit: draw.total_amount,
        },
      ]
    );
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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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

  // Atomicity model: do all GL + side-effect work while the draw is still
  // 'submitted', then flip status to 'funded' LAST as the commit point. If any
  // step fails, return early — status stays 'submitted' so the user can retry
  // without DB surgery. The final status update is conditional on status still
  // being 'submitted' to catch concurrent funding (narrow race; at worst
  // produces duplicate JEs rather than a status/GL mismatch).

  // Post JEs for funding event:
  //   (a) DR Cash (1000) / CR Due from Lender (1120)  — cash arrived, receivable cleared
  //   (b) DR Draws Pending Funding (2060) / CR per-loan Loan Payable (220x) — loan balance
  //       increases NOW (not at submission)
  const lender = draw.contacts as { name: string } | null;
  const lenderName = lender?.name ?? "Unknown Lender";
  const displayName = drawDisplayName(draw.draw_date);
  const today = new Date().toISOString().split("T")[0];

  const accounts = await getAccountIdMap(supabase, ["1000", "1120", "1210", "1230", "2000", "2060", "2100", "6900"]);

  const acct1000 = accounts.get("1000");
  const acct1120 = accounts.get("1120");
  const acct1210 = accounts.get("1210");
  const acct1230 = accounts.get("1230");
  const acct2000 = accounts.get("2000");
  const acct2060 = accounts.get("2060");
  const acct6900 = accounts.get("6900");
  const fallbackLoanPayableId = accounts.get("2100");

  // Load all invoices in this draw (needed for both WIP/AP and loan balance update)
  const { data: drawInvoiceDetails } = await supabase
    .from("draw_invoices")
    .select(`
      invoice_id,
      invoices (
        id, amount, vendor, invoice_number, project_id, wip_ap_posted,
        projects ( project_type )
      )
    `)
    .eq("draw_id", drawId);

  // Load line items for all invoices in this draw — used to split amounts
  // across projects (and thus loans) for multi-project invoices.
  const allInvoiceIds = (drawInvoiceDetails ?? [])
    .map((di) => (di.invoices as { id: string } | null)?.id)
    .filter(Boolean) as string[];
  type DrawLineItem = {
    invoice_id: string;
    project_id: string | null;
    amount: number | null;
  };
  const lineItemsByInvoice = new Map<string, DrawLineItem[]>();
  if (allInvoiceIds.length > 0) {
    const { data: liRows } = await supabase
      .from("invoice_line_items")
      .select("invoice_id, project_id, amount")
      .in("invoice_id", allInvoiceIds);
    for (const li of (liRows ?? []) as DrawLineItem[]) {
      if (!lineItemsByInvoice.has(li.invoice_id)) lineItemsByInvoice.set(li.invoice_id, []);
      lineItemsByInvoice.get(li.invoice_id)!.push(li);
    }
  }

  // Build per-project amount totals from line items where available, otherwise
  // fall back to the invoice's header project. This is the source of truth
  // for loan balance JE credits and loans.current_balance updates.
  const projectAmountsForLoan = new Map<string, number>();
  let untiedAmount = 0; // amount with no project (header null AND no line-item project)
  for (const di of drawInvoiceDetails ?? []) {
    const inv = di.invoices as { id: string; project_id: string | null; amount: number | null } | null;
    if (!inv || !inv.amount) continue;
    const lineItems = lineItemsByInvoice.get(inv.id) ?? [];
    if (lineItems.length > 0) {
      for (const li of lineItems) {
        const amt = li.amount ?? 0;
        if (amt === 0) continue;
        const pid = li.project_id ?? inv.project_id ?? null;
        if (pid) {
          projectAmountsForLoan.set(pid, (projectAmountsForLoan.get(pid) ?? 0) + amt);
        } else {
          untiedAmount += amt;
        }
      }
    } else if (inv.project_id) {
      projectAmountsForLoan.set(
        inv.project_id,
        (projectAmountsForLoan.get(inv.project_id) ?? 0) + inv.amount
      );
    } else {
      untiedAmount += inv.amount;
    }
  }

  if (acct1000 && acct1120) {
    // Cash and 1120 are company-level (not project-specific) — project_id: null
    const cashResult = await postJournalEntry(
      supabase,
      {
        entry_date: today,
        reference: `DRAW-FUND-${drawId.slice(0, 8)}`,
        description: `Draw funded — ${displayName} — ${lenderName}`,
        status: "posted",
        source_type: "loan_draw",
        source_id: draw.id,
        user_id: user!.id,
      },
      [
        {
          account_id: acct1000,
          project_id: null,
          description: `Cash received — ${displayName} — ${lenderName}`,
          debit: draw.total_amount,
          credit: 0,
        },
        {
          account_id: acct1120,
          project_id: null,
          description: `Clear Due from Lender — ${displayName} — ${lenderName}`,
          debit: 0,
          credit: draw.total_amount,
        },
      ]
    );

    if (cashResult.error) return { error: `Cash JE posting failed: ${cashResult.error}` };
  }

  // Step 3b: Clear Draws Pending Funding (2060) → per-loan Loan Payable (220x)
  // Per-line-item project allocation (projectAmountsForLoan computed above):
  // each project's share credits that project's specific COA account. This is
  // when the loan balance legitimately increases. Multi-project invoices split
  // correctly across loans.
  if (acct2060 && drawInvoiceDetails && drawInvoiceDetails.length > 0) {
    // Look up per-loan COA accounts for these projects
    const pIds = [...projectAmountsForLoan.keys()];
    const loanCOAMap = new Map<string, string>(); // project_id → coa_account_id
    if (pIds.length > 0 && draw.lender_id) {
      const { data: loanRows } = await supabase
        .from("loans")
        .select("project_id, coa_account_id")
        .eq("lender_id", draw.lender_id)
        .in("project_id", pIds)
        .eq("status", "active");
      for (const loan of loanRows ?? []) {
        if (loan.project_id && loan.coa_account_id) {
          loanCOAMap.set(loan.project_id, loan.coa_account_id);
        }
      }
    }

    // Group credited amounts by COA account (unmapped → fallback 2100)
    const coaAmounts = new Map<string, number>();
    let unmapped = untiedAmount;
    for (const [pId, amt] of projectAmountsForLoan) {
      const coaId = loanCOAMap.get(pId);
      if (coaId) {
        coaAmounts.set(coaId, (coaAmounts.get(coaId) ?? 0) + amt);
      } else {
        unmapped += amt;
      }
    }
    if (unmapped > 0 && fallbackLoanPayableId) {
      coaAmounts.set(fallbackLoanPayableId, (coaAmounts.get(fallbackLoanPayableId) ?? 0) + unmapped);
    }

    if (coaAmounts.size > 0) {
      const loanJeLines: {
        account_id: string;
        project_id: string | null;
        description: string;
        debit: number;
        credit: number;
      }[] = [
        // Single debit: clear the Draws Pending Funding account
        {
          account_id: acct2060,
          project_id: null,
          description: `Clear Draws Pending Funding — ${displayName} — ${lenderName}`,
          debit: draw.total_amount,
          credit: 0,
        },
      ];
      // Per-loan credits to each specific loan payable account
      for (const [coaId, creditAmount] of coaAmounts) {
        loanJeLines.push({
          account_id: coaId,
          project_id: null,
          description: `Loan Payable — ${displayName} — ${lenderName}`,
          debit: 0,
          credit: creditAmount,
        });
      }
      const loanResult = await postJournalEntry(
        supabase,
        {
          entry_date: today,
          reference: `DRAW-LOAN-${drawId.slice(0, 8)}`,
          description: `Loan balance recognized — ${displayName} — ${lenderName}`,
          status: "posted",
          source_type: "loan_draw",
          source_id: draw.id,
          user_id: user!.id,
        },
        loanJeLines
      );
      if (loanResult.error) return { error: `Loan JE posting failed: ${loanResult.error}` };
    }
  }

  // Step 3d: Post WIP/AP JEs — skip invoices that already had WIP/AP posted at approval
  // (wip_ap_posted = true means approveInvoice already handled it).
  // Now reads line items per invoice to get per-project WIP account mapping.
  if (acct1210 && acct1230 && acct2000) {
    type InvDetail = {
      id: string;
      amount: number | null;
      vendor: string | null;
      invoice_number: string | null;
      project_id: string | null;
      wip_ap_posted: boolean | null;
      projects: { project_type: string } | null;
    };

    const wipLines: {
      account_id: string;
      project_id: string | null;
      description: string;
      debit: number;
      credit: number;
    }[] = [];
    let totalWip = 0;
    const newlyPostedInvoiceIds: string[] = [];

    // Collect invoice IDs that need WIP posting
    const needsWipInvoiceIds: string[] = [];
    for (const di of drawInvoiceDetails ?? []) {
      const inv = di.invoices as InvDetail | null;
      if (!inv || !inv.amount) continue;
      if (inv.wip_ap_posted) continue;
      needsWipInvoiceIds.push(inv.id);
      newlyPostedInvoiceIds.push(inv.id);
      totalWip += inv.amount;
    }

    // Load line items for invoices that need WIP posting
    if (needsWipInvoiceIds.length > 0 && totalWip > 0) {
      const { data: drawLineItems } = await supabase
        .from("invoice_line_items")
        .select("invoice_id, amount, project_id, projects ( project_type )")
        .in("invoice_id", needsWipInvoiceIds);

      // Build debit lines from line items (per project)
      for (const li of drawLineItems ?? []) {
        if (!li.amount || li.amount <= 0) continue;
        const projType = (li.projects as { project_type: string } | null)?.project_type ?? null;
        const isLandDev = projType === "land_development";
        // Look up the invoice's vendor label for the description
        const parentDi = (drawInvoiceDetails ?? []).find(d => (d.invoices as InvDetail | null)?.id === li.invoice_id);
        const parentInv = parentDi?.invoices as InvDetail | null;
        const invLabel = parentInv ? [parentInv.vendor, parentInv.invoice_number].filter(Boolean).join(" — Inv #") : "Construction cost";

        // Determine correct debit account: no project → G&A (6900), land dev → CIP (1230), else → WIP (1210)
        const debitAcctId = !li.project_id ? (acct6900 ?? acct1210) : (isLandDev ? acct1230 : acct1210);

        wipLines.push({
          account_id: debitAcctId,
          project_id: li.project_id ?? null,
          description: invLabel,
          debit: li.amount,
          credit: 0,
        });
      }
    }

    if (wipLines.length > 0 && totalWip > 0) {
      const wipResult = await postJournalEntry(
        supabase,
        {
          entry_date: today,
          reference: `DRAW-WIP-${drawId.slice(0, 8)}`,
          description: `Construction costs — ${displayName} — ${lenderName}`,
          status: "posted",
          source_type: "loan_draw",
          source_id: draw.id,
          user_id: user!.id,
        },
        [
          ...wipLines,
          {
            account_id: acct2000,
            project_id: null,
            description: `Accounts Payable — ${displayName} — ${lenderName}`,
            debit: 0,
            credit: totalWip,
          },
        ]
      );

      if (wipResult.error) return { error: `WIP/AP JE posting failed: ${wipResult.error}` };
      // Mark these invoices so they won't be double-posted if touched again
      if (newlyPostedInvoiceIds.length > 0) {
        const { error: flagErr } = await supabase
          .from("invoices")
          .update({ wip_ap_posted: true })
          .in("id", newlyPostedInvoiceIds);
        if (flagErr) return { error: `Failed to flag invoices as posted: ${flagErr.message}` };
      }
    }
  }

  // Step 3e: Update each loan's current_balance by the funded amount per
  // project (sourced from line items so multi-project invoices split correctly).
  if (draw.lender_id && projectAmountsForLoan.size > 0) {
    for (const [projectId, fundedAmt] of projectAmountsForLoan) {
      const { data: loan } = await supabase
        .from("loans")
        .select("id, current_balance")
        .eq("project_id", projectId)
        .eq("lender_id", draw.lender_id)
        .eq("status", "active")
        .maybeSingle();

      if (loan) {
        const { error: balErr } = await supabase
          .from("loans")
          .update({ current_balance: (loan.current_balance ?? 0) + fundedAmt })
          .eq("id", loan.id);
        if (balErr) return { error: `Failed to update loan balance: ${balErr.message}` };
      }
    }
  }

  // Step 3f: Lock invoices in this draw (mark pending_draw = false to prevent re-draw).
  // Done after JEs post successfully so a JE failure leaves pending_draw alone and
  // the user can retry fundDraw without manually re-flagging invoices.
  const lockIds = (drawInvoiceDetails ?? [])
    .map((di) => (di.invoices as { id: string } | null)?.id)
    .filter(Boolean) as string[];
  if (lockIds.length > 0) {
    const { error: lockErr } = await supabase
      .from("invoices")
      .update({ pending_draw: false })
      .in("id", lockIds);
    if (lockErr) return { error: `Failed to lock invoices: ${lockErr.message}` };
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

  // Final commit: flip status to 'funded'. Conditional on status still being
  // 'submitted' to catch a concurrent funding attempt (rare) — if that happens,
  // the other request already posted JEs too, so we flag it for review.
  const { data: flipped, error: flipErr } = await supabase
    .from("loan_draws")
    .update({ status: "funded" })
    .eq("id", drawId)
    .eq("status", "submitted")
    .select("id");

  if (flipErr) return { error: `Funding complete but status flip failed: ${flipErr.message}` };
  if (!flipped || flipped.length === 0) {
    return {
      error: "Draw was funded by a concurrent request — review GL for duplicate entries",
    };
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
  paymentDate: string,
  discountTaken?: number
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Load the vendor payment record
  const { data: vp } = await supabase
    .from("vendor_payments")
    .select("id, draw_id, vendor_id, vendor_name, amount, status")
    .eq("id", vendorPaymentId)
    .single();

  if (!vp) return { error: "Vendor payment not found" };
  if (vp.status === "paid") return { error: "This vendor has already been paid" };

  if (!paymentDate) return { error: "Payment date is required" };

  const discount = discountTaken && discountTaken > 0 ? discountTaken : 0;

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

  // Mark invoices as released (check written, not yet cleared at bank)
  if (invoiceIds.length > 0) {
    const { error: invErr } = await supabase
      .from("invoices")
      .update({
        status: "released",
        payment_method: "check",
      })
      .in("id", invoiceIds);
    if (invErr) return { error: invErr.message };
  }

  // If discount was taken, distribute it across the linked invoices and
  // determine which WIP accounts to credit back.
  let totalDiscount = discount;
  type DiscountByWip = { accountNumber: string; projectId: string | null; amount: number };
  const discountsByWip: DiscountByWip[] = [];

  if (discount > 0 && invoiceIds.length > 0) {
    // Load invoice details to determine per-invoice WIP account
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, total_amount, amount, project_id, projects ( project_type )")
      .in("id", invoiceIds);

    if (invoices && invoices.length > 0) {
      // Calculate total invoice amount for pro-rata distribution
      const totalInvAmt = invoices.reduce(
        (s, inv) => s + ((inv.total_amount ?? inv.amount ?? 0) as number), 0
      );

      let distributed = 0;
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        const invAmt = (inv.total_amount ?? inv.amount ?? 0) as number;
        // Pro-rata share; last invoice gets remainder to avoid rounding issues
        const share = i === invoices.length - 1
          ? totalDiscount - distributed
          : Math.round((invAmt / totalInvAmt) * totalDiscount * 100) / 100;
        distributed += share;

        if (share > 0) {
          // Save discount on the invoice record
          await supabase
            .from("invoices")
            .update({ discount_taken: share })
            .eq("id", inv.id);

          const projType = (inv.projects as { project_type: string } | null)?.project_type;
          const wipAcct = !inv.project_id
            ? "6900"
            : projType === "land_development"
            ? "1230"
            : "1210";

          discountsByWip.push({
            accountNumber: wipAcct,
            projectId: inv.project_id ?? null,
            amount: share,
          });
        }
      }
    }
  }

  const netAmount = vp.amount - totalDiscount;

  // Guard: if a discount was requested but couldn't be allocated to any WIP
  // account (e.g. no linked invoices were found), abort before posting any JE
  // — otherwise AP would be under-cleared by the discount amount.
  if (totalDiscount > 0 && discountsByWip.length === 0) {
    return {
      error: "Discount was specified but could not be allocated to any invoice — aborting",
    };
  }

  // Post GL entry: DR Accounts Payable (2000) / CR Checks Issued - Outstanding (2050)
  // With discount: also CR WIP/CIP for the discount portion
  const glAccountNumbers = ["2000", "2050"];
  if (totalDiscount > 0) {
    for (const d of discountsByWip) {
      if (!glAccountNumbers.includes(d.accountNumber)) glAccountNumbers.push(d.accountNumber);
    }
  }

  const accounts = await getAccountIdMap(supabase, glAccountNumbers);

  const acct2000 = accounts.get("2000");
  const acct2050 = accounts.get("2050");

  const checkRef = checkNumber?.trim()
    ? `Check #${checkNumber.trim()}`
    : `VPmt-${vendorPaymentId.slice(0, 8)}`;

  if (acct2000 && acct2050) {
    // Primary JE: clear AP and record outstanding check at the NET cash amount.
    // This mirrors the CLAUDE.md spec exactly: DR AP / CR 2050 for the amount
    // of cash that actually leaves (or will leave) the bank.
    const primary = await postJournalEntry(
      supabase,
      {
        entry_date: paymentDate,
        reference: checkRef,
        description: `Check issued — ${vp.vendor_name}`,
        status: "posted",
        source_type: "invoice_payment",
        source_id: vendorPaymentId,
        user_id: user.id,
      },
      [
        {
          account_id: acct2000,
          project_id: null,
          description: `AP cleared — ${checkRef} — ${vp.vendor_name}`,
          debit: netAmount,
          credit: 0,
        },
        {
          account_id: acct2050,
          project_id: null,
          description: `Check issued — ${checkRef} — ${vp.vendor_name}`,
          debit: 0,
          credit: netAmount,
        },
      ]
    );
    if (primary.error) return { error: `Check JE posting failed: ${primary.error}` };

    // Discount JE (separate, only when a discount was taken): clear the
    // residual AP (the discount we no longer owe) against WIP/CIP per project
    // so the capitalized cost reflects the discount. Keeping this as its own
    // JE with reference `DISC-VP-{id}` produces a clean audit trail.
    if (totalDiscount > 0 && discountsByWip.length > 0) {
      const discountLines: Array<{
        account_id: string;
        project_id: string | null;
        description: string;
        debit: number;
        credit: number;
      }> = [
        {
          account_id: acct2000,
          project_id: null,
          description: `AP reduced for early-pay discount — ${vp.vendor_name}`,
          debit: totalDiscount,
          credit: 0,
        },
      ];
      for (const d of discountsByWip) {
        const wipAcctId = accounts.get(d.accountNumber);
        if (wipAcctId) {
          discountLines.push({
            account_id: wipAcctId,
            project_id: d.projectId,
            description: `Early-pay discount — ${vp.vendor_name}`,
            debit: 0,
            credit: d.amount,
          });
        }
      }

      const discountResult = await postJournalEntry(
        supabase,
        {
          entry_date: paymentDate,
          reference: `DISC-VP-${vendorPaymentId.slice(0, 8)}`,
          description: `Early-pay discount $${totalDiscount.toFixed(2)} — ${vp.vendor_name}`,
          status: "posted",
          source_type: "invoice_payment",
          source_id: vendorPaymentId,
          user_id: user.id,
        },
        discountLines
      );
      if (discountResult.error) return { error: `Discount JE posting failed: ${discountResult.error}` };
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-create a payments register record so this check shows in the register.
  // Status "outstanding" = check cut but not yet cleared at bank.
  // ---------------------------------------------------------------------------
  const { data: paymentRecord } = await supabase
    .from("payments")
    .insert({
      payment_number: checkNumber?.trim() || null,
      payment_method: "check",
      payee: vp.vendor_name,
      vendor_id: vp.vendor_id ?? null,
      amount: vp.amount,
      discount_amount: totalDiscount,
      payment_date: paymentDate,
      cleared_date: null,
      status: "outstanding",
      funding_source: "bank_funded",
      draw_id: vp.draw_id,
      vendor_payment_id: vendorPaymentId,
      notes: totalDiscount > 0
        ? `Draw check w/ $${totalDiscount.toFixed(2)} early-pay discount`
        : `Draw check — ${vp.vendor_name}`,
      user_id: user.id,
    })
    .select("id")
    .single();

  // Link the same invoices to the payment register record
  if (paymentRecord && invoiceIds.length > 0) {
    const paymentInvoiceLinks = invoiceIds.map((invId) => ({
      payment_id: paymentRecord.id,
      invoice_id: invId,
      amount: 0, // individual amounts are on the invoices themselves
    }));
    // Fetch actual amounts for the links
    const { data: invAmounts } = await supabase
      .from("invoices")
      .select("id, total_amount, amount")
      .in("id", invoiceIds);
    if (invAmounts) {
      for (const link of paymentInvoiceLinks) {
        const inv = invAmounts.find((i) => i.id === link.invoice_id);
        link.amount = (inv?.total_amount ?? inv?.amount ?? 0) as number;
      }
    }
    await supabase.from("payment_invoices").insert(paymentInvoiceLinks);
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
  revalidatePath("/banking/payments");
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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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

  // Determine project_id from first linked invoice. The nested shape from
  // PostgREST for this join isn't fully inferred by the generic client types,
  // so narrow manually with an explicit type cast.
  type JoinedInvoice = {
    id: string;
    project_id: string | null;
    projects: { project_type: string | null } | null;
  } | null;

  let projectId: string | null = null;
  let isLandDev = false;
  const firstLink = (links ?? [])[0];
  if (firstLink) {
    const firstInvoice = (firstLink as { invoices: JoinedInvoice }).invoices;
    if (firstInvoice) {
      projectId = firstInvoice.project_id ?? null;
      isLandDev = firstInvoice.projects?.project_type === "land_development";
    }
  }

  // Fetch chart of accounts
  const accounts = await getAccountIdMap(supabase, ["1210", "1230", "2000"]);

  const acct1210 = accounts.get("1210");
  const acct1230 = accounts.get("1230");
  const acct2000 = accounts.get("2000");

  if (acct1210 && acct1230 && acct2000) {
    const wipAcctId = isLandDev ? acct1230 : acct1210;
    const adjustmentAbsolute = Math.abs(adjustment);

    let jeLines: {
      account_id: string;
      project_id: string | null;
      description: string;
      debit: number;
      credit: number;
    }[];

    if (adjustment < 0) {
      // Negative adjustment (credit) — reduces what we owe
      // DR Accounts Payable (2000), CR WIP (1210 or 1230)
      jeLines = [
        {
          account_id: acct2000,
          project_id: projectId,
          description: `Vendor credit — ${description}`,
          debit: adjustmentAbsolute,
          credit: 0,
        },
        {
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
          account_id: wipAcctId,
          project_id: projectId,
          description: `Additional vendor charge — ${description}`,
          debit: adjustmentAbsolute,
          credit: 0,
        },
        {
          account_id: acct2000,
          project_id: projectId,
          description: `Additional vendor liability — ${description}`,
          debit: 0,
          credit: adjustmentAbsolute,
        },
      ];
    }

    const adjResult = await postJournalEntry(
      supabase,
      {
        entry_date: new Date().toISOString().split("T")[0],
        reference: `ADJ-VP-${vendorPaymentId.slice(0, 8)}`,
        description: `Vendor payment adjustment — ${description}`,
        status: "posted",
        source_type: "vendor_adjustment",
        source_id: vendorPaymentId,
        user_id: user.id,
      },
      jeLines
    );

    if (adjResult.error) {
      console.error(`Adjustment JE failed: ${adjResult.error}`);
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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
