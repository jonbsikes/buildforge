"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getAccountIdMap } from "@/lib/gl/accounts";
import { postJournalEntry } from "@/lib/gl/postEntry";

export interface LineItemInput {
  cost_code: string; // text code, e.g. "47"
  description: string;
  amount: number;
  project_id: string | null; // each line item can target a different project
}

export interface SaveInvoiceInput {
  // Header — project_id is now derived from the dominant line item
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

  // Line items (each has its own project_id)
  line_items: LineItemInput[];

  // Derived from line items
  project_name: string; // for display name, "Company" if G&A

  // User-selected at creation
  status?: "pending_review" | "approved" | "released" | "cleared" | "disputed" | "void";
  pending_draw?: boolean;
  // When the bank auto-drafts the payment, skip AP and post DR WIP / CR Cash at approval
  direct_cash_payment?: boolean;
  payment_method?: "check" | "ach" | "wire" | "credit_card" | null;
}

export async function saveInvoice(
  input: SaveInvoiceInput
): Promise<{ error?: string; invoiceId?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!input.vendor_id) return { error: "A vendor must be selected. Create the vendor first if they are not in the system." };

  if (input.line_items.length === 0) return { error: "At least one line item is required" };

  // Validate all line items have positive amounts
  if (input.line_items.some((li) => isNaN(li.amount) || li.amount <= 0)) {
    return { error: "All line item amounts must be positive numbers" };
  }

  // Calculate total from line items
  const totalAmount = input.line_items.reduce((sum, li) => sum + li.amount, 0);
  if (totalAmount <= 0) return { error: "Invoice total must be greater than zero" };

  // Validate all line item cost codes exist
  const uniqueCodes = [...new Set(input.line_items.map((li) => li.cost_code).filter(Boolean))];
  if (uniqueCodes.length > 0) {
    const { data: validCodes } = await supabase
      .from("cost_codes")
      .select("code")
      .in("code", uniqueCodes)
      .is("user_id", null);
    const validSet = new Set((validCodes ?? []).map((c) => String(c.code)));
    const invalid = uniqueCodes.filter((c) => !validSet.has(c));
    if (invalid.length > 0) {
      return { error: `Invalid cost code(s): ${invalid.join(", ")}` };
    }
  }

  // Find dominant line item (largest amount) — its project_id becomes the header project_id
  const dominant = input.line_items.reduce((max, li) => (li.amount > max.amount ? li : max));
  const headerProjectId = dominant.project_id || null;

  // Look up the UUID for the dominant cost code.
  // Use maybeSingle() so a miss returns null instead of erroring. If the code
  // can't be resolved globally, fall back to a user-scoped row before giving up
  // so we don't silently write cost_code_id = null to the invoice header.
  const dominantCodeStr = dominant.cost_code ? String(dominant.cost_code).trim() : "";
  const dominantCodeNumeric = dominantCodeStr ? String(parseInt(dominantCodeStr) || 0) : "";
  let dominantCode: { id: string; name: string | null } | null = null;
  if (dominantCodeNumeric && dominantCodeNumeric !== "0") {
    const { data: globalCode } = await supabase
      .from("cost_codes")
      .select("id, name")
      .eq("code", dominantCodeNumeric)
      .is("user_id", null)
      .maybeSingle();
    if (globalCode) {
      dominantCode = globalCode;
    } else {
      const { data: userCode } = await supabase
        .from("cost_codes")
        .select("id, name")
        .eq("code", dominantCodeNumeric)
        .eq("user_id", user.id)
        .maybeSingle();
      dominantCode = userCode ?? null;
    }
    if (!dominantCode) {
      console.warn(
        `[saveInvoice] Could not resolve cost_code_id for code="${dominantCodeStr}" — invoice header will have cost_code_id=null.`
      );
    }
  }

  // Look up vendor name if vendor_id provided
  let vendorDisplay = input.vendor_name.trim() || "Unknown Vendor";

  // Build display name: Vendor – Code – Project – Invoice#
  const displayName = [
    vendorDisplay,
    dominant.cost_code,
    input.project_name || "Company",
    input.invoice_number || "—",
  ].join(" – ");

  // Default due_date to invoice_date (or today) if not provided
  const dueDate = input.due_date || input.invoice_date || new Date().toISOString().split("T")[0];

  // Always insert as pending_review — any non-pending target status is applied
  // immediately after via applyStatusTransition so the GL stays in sync.
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      project_id: headerProjectId,
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
      pending_draw: input.pending_draw ?? false,
      direct_cash_payment: input.direct_cash_payment ?? false,
      payment_method: input.payment_method ?? null,
      manually_reviewed: false,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { error: invoiceError?.message ?? "Failed to save invoice" };
  }

  // Save line items (must exist before applyStatusTransition so the WIP split is correct)
  if (input.line_items.length > 0) {
    const { error: lineError } = await supabase.from("invoice_line_items").insert(
      input.line_items.map((li) => ({
        invoice_id: invoice.id,
        cost_code: li.cost_code ? String(li.cost_code) : null,
        description: li.description || null,
        amount: li.amount,
        project_id: li.project_id || null,
      }))
    );
    if (lineError) {
      return { error: lineError.message };
    }
  }

  // Apply the user's chosen status (posts any required JEs)
  const desiredStatus = (input.status ?? "pending_review") as InvoiceStatus;
  if (desiredStatus !== "pending_review") {
    const t = await applyStatusTransition(invoice.id, desiredStatus);
    if (t.error) {
      // Invoice row and line items exist but status advance failed — surface error,
      // leave row in pending_review so the user can retry from the UI.
      revalidatePath("/invoices");
      return { error: t.error, invoiceId: invoice.id };
    }
  }

  revalidatePath("/invoices");
  return { invoiceId: invoice.id };
}

export async function approveInvoice(
  invoiceId: string
): Promise<{ error?: string; success?: boolean }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch current state including fields needed for GL posting
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      status, ai_confidence, manually_reviewed, pending_draw,
      total_amount, amount, project_id, vendor, vendor_id, invoice_number,
      direct_cash_payment,
      projects ( project_type )
    `)
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { error: "Invoice not found" };

  // Strict approval gate: vendor, every line item's cost code, and a positive
  // amount must all be present. The email-ingestion path can produce invoices
  // missing any of these (vendor not in master list, AI hallucinated a code,
  // amount unreadable). Block approval until the user fixes them on the edit
  // form — saveInvoice flips manually_reviewed=true on a successful save.
  if (!invoice.manually_reviewed) {
    if (!invoice.vendor_id) {
      return { error: "Needs attention — pick a vendor before approving." };
    }
    const amt = (invoice.total_amount ?? invoice.amount ?? 0) as number;
    if (!amt || amt <= 0) {
      return { error: "Needs attention — invoice amount must be greater than zero." };
    }
    const { data: missingLines } = await supabase
      .from("invoice_line_items")
      .select("id")
      .eq("invoice_id", invoiceId)
      .is("cost_code", null)
      .limit(1);
    if (missingLines && missingLines.length > 0) {
      return { error: "Needs attention — assign a cost code to every line item before approving." };
    }
    if (invoice.ai_confidence === "low") {
      return {
        error:
          "This invoice was flagged as low confidence by AI. Please review and edit at least one field before approving.",
      };
    }
  }

  // Status gate is enforced in the UPDATE predicate below (race-safe) — no
  // separate check here, to avoid a time-of-check/time-of-use gap.

  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  const today = new Date().toISOString().split("T")[0];
  const invLabel = [invoice.vendor, invoice.invoice_number].filter(Boolean).join(" — Inv #") || "Invoice";

  // Load line items with per-line project info for multi-project GL posting
  const { data: lineItems } = await supabase
    .from("invoice_line_items")
    .select("amount, project_id, projects ( project_type )")
    .eq("invoice_id", invoiceId);

  // Helper: determine WIP debit account for a given line item's project
  function getDebitAccountNumber(liProjectId: string | null, liProjectType: string | null): string {
    if (!liProjectId) return "6900"; // G&A
    if (liProjectType === "land_development") return "1230"; // CIP — Land
    return "1210"; // Construction WIP
  }

  // Group line item amounts by (debit account, project_id) for JE lines
  type DebitGroup = { accountNumber: string; projectId: string | null; amount: number };
  const debitGroups = new Map<string, DebitGroup>();
  for (const li of lineItems ?? []) {
    if (!li.amount || li.amount <= 0) continue;
    const projType = (li.projects as { project_type: string } | null)?.project_type ?? null;
    const acctNum = getDebitAccountNumber(li.project_id ?? null, projType);
    const key = `${acctNum}|${li.project_id ?? "null"}`;
    const existing = debitGroups.get(key);
    if (existing) {
      existing.amount += li.amount;
    } else {
      debitGroups.set(key, { accountNumber: acctNum, projectId: li.project_id ?? null, amount: li.amount });
    }
  }

  // Collect all unique GL account numbers needed
  const allAccountNumbers = new Set<string>();
  for (const g of debitGroups.values()) allAccountNumbers.add(g.accountNumber);

  if (invoice.direct_cash_payment) {
    // ── Direct cash payment path ────────────────────────────────────────────
    // Bank auto-drafted this payment. Skip AP entirely.
    // JE: DR WIP/CIP per line-item project / CR Cash (1000)
    // Invoice advances directly to 'cleared'.
    // Post JE FIRST, then update status only on success.

    let jePosted = false;
    if (invoiceAmount > 0) {
      allAccountNumbers.add("1000");
      const acctMap = await getAccountIdMap(supabase, allAccountNumbers);
      const acct1000 = acctMap.get("1000");

      if (!acct1000) {
        return { error: "Required GL account Cash (1000) not found in chart of accounts." };
      }
      if (debitGroups.size === 0) {
        return { error: "No debit lines could be generated — check invoice line items." };
      }

      const jeLines: { account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [];

      for (const g of debitGroups.values()) {
        const acctId = acctMap.get(g.accountNumber);
        if (acctId) {
          jeLines.push({
            account_id: acctId,
            project_id: g.projectId,
            description: `Loan interest — ${invLabel}`,
            debit: g.amount,
            credit: 0,
          });
        }
      }

      jeLines.push({
        account_id: acct1000,
        project_id: null,
        description: `Bank auto-draft — ${invLabel}`,
        debit: 0,
        credit: invoiceAmount,
      });

      const jeResult = await postJournalEntry(
        supabase,
        {
          entry_date: today,
          reference: `INV-CASH-${invoiceId.slice(0, 8)}`,
          description: `Loan interest — bank auto-draft — ${invLabel}`,
          status: "posted",
          source_type: "invoice_approval",
          source_id: invoiceId,
          user_id: user.id,
        },
        jeLines
      );

      if (jeResult.error) return { error: jeResult.error };
      jePosted = true;
    }

    const { data: updated, error } = await supabase
      .from("invoices")
      .update({
        status: "cleared",
        payment_date: today,
        payment_method: "ach",
        wip_ap_posted: jePosted,
      })
      .eq("id", invoiceId)
      .eq("status", "pending_review")
      .select("id");

    if (error) return { error: error.message };
    if (!updated || updated.length === 0) {
      return { error: "Invoice is not in pending_review status (it may already have been approved)" };
    }

    // Create a Payment Register row so bank auto-drafts are visible in /banking/payments.
    // payment_method = 'auto_draft', status = 'cleared', funding_source = 'dda'.
    if (invoiceAmount > 0) {
      const { data: paymentRow } = await supabase
        .from("payments")
        .insert({
          payment_number: null,
          payment_method: "auto_draft",
          payee: invoice.vendor ?? "Bank",
          vendor_id: invoice.vendor_id ?? null,
          amount: invoiceAmount,
          discount_amount: 0,
          payment_date: today,
          cleared_date: today,
          status: "cleared",
          funding_source: "dda",
          draw_id: null,
          vendor_payment_id: null,
          notes: `Bank auto-draft — ${invLabel}`,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (paymentRow) {
        await supabase.from("payment_invoices").insert({
          payment_id: paymentRow.id,
          invoice_id: invoiceId,
          amount: invoiceAmount,
        });
      }
    }
  } else {
    // ── Standard AP path ────────────────────────────────────────────────────
    // Post WIP/AP JE per line-item project FIRST, then advance status.
    // fundDraw checks wip_ap_posted to prevent double-entry.

    let jePosted = false;
    if (invoiceAmount > 0) {
      allAccountNumbers.add("2000");
      const acctMap = await getAccountIdMap(supabase, allAccountNumbers);
      const acct2000 = acctMap.get("2000");

      if (!acct2000) {
        return { error: "Required GL account Accounts Payable (2000) not found in chart of accounts." };
      }
      if (debitGroups.size === 0) {
        return { error: "No debit lines could be generated — check invoice line items." };
      }

      const jeLines: { account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [];

      for (const g of debitGroups.values()) {
        const acctId = acctMap.get(g.accountNumber);
        if (acctId) {
          jeLines.push({
            account_id: acctId,
            project_id: g.projectId,
            description: invLabel,
            debit: g.amount,
            credit: 0,
          });
        }
      }

      jeLines.push({
        account_id: acct2000,
        project_id: null,
        description: `AP — ${invLabel}`,
        debit: 0,
        credit: invoiceAmount,
      });

      const result = await postJournalEntry(
        supabase,
        {
          entry_date: today,
          reference: `INV-APPR-${invoiceId.slice(0, 8)}`,
          description: `Invoice approved — ${invLabel}`,
          status: "posted",
          source_type: "invoice_approval",
          source_id: invoiceId,
          user_id: user.id,
        },
        jeLines
      );

      if (result.error) return { error: result.error };
      jePosted = true;
    }

    const { data: updated, error } = await supabase
      .from("invoices")
      .update({ status: "approved", wip_ap_posted: jePosted })
      .eq("id", invoiceId)
      .eq("status", "pending_review")
      .select("id");

    if (error) return { error: error.message };
    if (!updated || updated.length === 0) {
      return { error: "Invoice is not in pending_review status (it may already have been approved)" };
    }
  }

  revalidatePath("/invoices");
  return { success: true };
}

export async function setPendingDraw(
  invoiceId: string,
  pending: boolean
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("invoices")
    .update({ pending_draw: pending })
    .eq("id", invoiceId);

  if (error) return { error: error.message };

  revalidatePath("/invoices");
  return {};
}

export async function setInvoiceStatus(
  invoiceId: string,
  status: string
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const valid: InvoiceStatus[] = [
    "pending_review", "approved", "released", "cleared", "disputed", "void",
  ];
  if (!valid.includes(status as InvoiceStatus)) {
    return { error: `Invalid status: ${status}` };
  }

  // Delegate to the transition router so the GL stays in sync (e.g. un-approve
  // reverses the WIP/AP JE via unapproveInvoice).
  const t = await applyStatusTransition(invoiceId, status as InvoiceStatus);
  if (t.error) return { error: t.error };

  revalidatePath("/invoices");
  return {};
}

export async function markManuallyReviewed(
  invoiceId: string
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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
// Status transition helpers
// ---------------------------------------------------------------------------
// All invoice status changes must flow through applyStatusTransition so the
// General Ledger stays in sync with the invoices table. saveInvoice,
// updateInvoice, and setInvoiceStatus all delegate here. Do not write the
// `status` field directly from those actions for any non-trivial transition.
// ---------------------------------------------------------------------------

type InvoiceStatus = "pending_review" | "approved" | "released" | "cleared" | "disputed" | "void";

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * Post DR AP (2000) / CR WIP per line-item project to reverse a previously
 * posted WIP/AP entry. Used by un-approve, approve→dispute, approve→void, and
 * dispute→void transitions. Caller is responsible for flipping the invoice
 * status and `wip_ap_posted` flag afterward.
 */
async function postWipApReversal(
  supabase: Supa,
  invoiceId: string,
  userId: string,
  reference: string,
  headerDescription: string,
  apLineDescription: string,
  wipLineDescription: string
): Promise<{ error?: string }> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("total_amount, amount, vendor, invoice_number")
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { error: "Invoice not found" };

  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  if (invoiceAmount <= 0) return {};

  const today = new Date().toISOString().split("T")[0];
  const invLabel =
    [invoice.vendor, invoice.invoice_number].filter(Boolean).join(" — Inv #") || "Invoice";

  const { data: liRows } = await supabase
    .from("invoice_line_items")
    .select("amount, project_id, projects ( project_type )")
    .eq("invoice_id", invoiceId);

  const accountNumbers = new Set(["2000"]);
  type Grp = { projectId: string | null; wipAccountNumber: string; amount: number };
  const groups = new Map<string, Grp>();
  for (const li of liRows ?? []) {
    if (!li.amount || li.amount <= 0) continue;
    const projType = (li.projects as { project_type: string } | null)?.project_type ?? null;
    const wipAcctNum = !li.project_id ? "6900" : projType === "land_development" ? "1230" : "1210";
    accountNumbers.add(wipAcctNum);
    const key = `${wipAcctNum}|${li.project_id ?? "null"}`;
    const existing = groups.get(key);
    if (existing) existing.amount += li.amount;
    else groups.set(key, { projectId: li.project_id ?? null, wipAccountNumber: wipAcctNum, amount: li.amount });
  }

  const acctMap = await getAccountIdMap(supabase, accountNumbers);
  const acct2000 = acctMap.get("2000");
  if (!acct2000 || groups.size === 0) return {};

  const lines: { account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [
    {
      account_id: acct2000,
      project_id: null,
      description: `${apLineDescription} — ${invLabel}`,
      debit: invoiceAmount,
      credit: 0,
    },
  ];
  for (const g of groups.values()) {
    const wipAcctId = acctMap.get(g.wipAccountNumber);
    if (wipAcctId) {
      lines.push({
        account_id: wipAcctId,
        project_id: g.projectId,
        description: `${wipLineDescription} — ${invLabel}`,
        debit: 0,
        credit: g.amount,
      });
    }
  }

  const result = await postJournalEntry(
    supabase,
    {
      entry_date: today,
      reference,
      description: `${headerDescription} — ${invLabel}`,
      status: "posted",
      source_type: "manual",
      source_id: invoiceId,
      user_id: userId,
    },
    lines
  );
  if (result.error) return { error: result.error };
  return {};
}

/**
 * Reverses a posted WIP/AP entry and flips an invoice back to pending_review.
 * Used for "un-approve" and for disputed-with-JE → pending_review transitions.
 */
async function unapproveInvoice(invoiceId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, wip_ap_posted")
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "released" || invoice.status === "cleared") {
    return { error: "Cannot un-approve a released or cleared invoice — reverse the check issuance first." };
  }
  if (await isInFundedDraw(supabase, invoiceId)) {
    return { error: "This invoice is part of a funded draw and cannot be un-approved." };
  }

  if (invoice.wip_ap_posted) {
    const r = await postWipApReversal(
      supabase,
      invoiceId,
      user.id,
      `INV-UNAPPR-${invoiceId.slice(0, 8)}`,
      "Invoice un-approved",
      "AP reversed — un-approve",
      "WIP reversal — un-approve"
    );
    if (r.error) return r;
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "pending_review", wip_ap_posted: false })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  return {};
}

/**
 * Internal: approve→disputed. Reverses WIP/AP (if posted) and flips status.
 * Clears pending_draw so the invoice isn't pulled into a new draw.
 */
async function disputeApproved(invoiceId: string, wipApPosted: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (wipApPosted) {
    const r = await postWipApReversal(
      supabase,
      invoiceId,
      user.id,
      `INV-DISPUTE-${invoiceId.slice(0, 8)}`,
      "Invoice disputed",
      "AP reversed — invoice disputed",
      "WIP reversal — invoice disputed"
    );
    if (r.error) return r;
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "disputed", wip_ap_posted: false, pending_draw: false })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  return {};
}

/**
 * Internal: any→void. Posts the correct reversing JE based on the invoice's
 * current state:
 *   - pending_review (wip_ap_posted = false): just void, no GL work
 *   - approved (wip_ap_posted = true): DR AP / CR WIP reversal
 *   - disputed (wip_ap_posted = true): DR AP / CR WIP reversal (subsumes
 *     the old `voidAfterDraw` case, where fundDraw re-posted WIP/AP for a
 *     disputed invoice that was included in a funded draw)
 *   - disputed (wip_ap_posted = false): just void, dispute already reversed
 *   - released/cleared: blocked
 */
async function voidFrom(invoiceId: string, from: InvoiceStatus, wipApPosted: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (from === "released") {
    return { error: "Cannot void a released invoice — the check must be cancelled first. Contact your accountant to reverse the check issuance." };
  }
  if (from === "cleared") {
    return { error: "Cannot void a cleared invoice — payment has already been made." };
  }
  if (from === "void") {
    return { error: "Invoice is already voided." };
  }

  if (wipApPosted) {
    const wasDrawn = await isInFundedDraw(supabase, invoiceId);
    const headerDesc = wasDrawn ? "Void after draw — vendor not paid" : "Invoice voided";
    const apDesc = wasDrawn ? "AP cleared — vendor not paid" : "AP cleared — invoice voided";
    const wipDesc = wasDrawn ? "WIP reduction — disputed invoice voided" : "WIP reversal — invoice voided";
    const reference = wasDrawn ? `VOID-DRAWN-${invoiceId.slice(0, 8)}` : `VOID-${invoiceId.slice(0, 8)}`;

    const r = await postWipApReversal(
      supabase, invoiceId, user.id, reference, headerDesc, apDesc, wipDesc
    );
    if (r.error) return r;
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "void", wip_ap_posted: false, pending_draw: false })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  return {};
}

/**
 * Router for any invoice status change. Every mutation of the `status`
 * column must flow through here so the correct journal entries post. The
 * private helpers (unapproveInvoice, disputeApproved, voidFrom) and the
 * approve/advance actions are the only places that write `status` directly.
 */
async function applyStatusTransition(
  invoiceId: string,
  to: InvoiceStatus
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select("status, wip_ap_posted, direct_cash_payment")
    .eq("id", invoiceId)
    .single();
  if (!inv) return { error: "Invoice not found" };
  const from = inv.status as InvoiceStatus;
  if (from === to) return {};

  // Forward chain from pending_review
  if (from === "pending_review") {
    if (to === "approved" || to === "released" || to === "cleared") {
      const r = await approveInvoice(invoiceId);
      if (r.error) return { error: r.error };
      // direct_cash_payment auto-advances to cleared inside approveInvoice
      if (inv.direct_cash_payment) return {};
      if (to === "released" || to === "cleared") {
        const r2 = await advanceInvoiceStatus(invoiceId, "released");
        if (r2.error) return { error: r2.error };
      }
      if (to === "cleared") {
        const r3 = await advanceInvoiceStatus(invoiceId, "cleared");
        if (r3.error) return { error: r3.error };
      }
      return {};
    }
    if (to === "disputed") {
      // Flag-only — no WIP/AP was posted, nothing to reverse.
      const { error } = await supabase
        .from("invoices")
        .update({ status: "disputed", pending_draw: false })
        .eq("id", invoiceId);
      return error ? { error: error.message } : {};
    }
    if (to === "void") {
      return await voidFrom(invoiceId, from, false);
    }
  }

  // approved → *
  if (from === "approved") {
    if (to === "pending_review") return await unapproveInvoice(invoiceId);
    if (to === "released") return await advanceInvoiceStatus(invoiceId, "released");
    if (to === "cleared") {
      const r = await advanceInvoiceStatus(invoiceId, "released");
      if (r.error) return { error: r.error };
      return await advanceInvoiceStatus(invoiceId, "cleared");
    }
    if (to === "disputed") return await disputeApproved(invoiceId, !!inv.wip_ap_posted);
    if (to === "void") return await voidFrom(invoiceId, from, !!inv.wip_ap_posted);
  }

  // released → *
  if (from === "released") {
    if (to === "cleared") return await advanceInvoiceStatus(invoiceId, "cleared");
    // dispute / void / un-release are all blocked — the check has been issued.
    if (to === "disputed") {
      return { error: "Cannot dispute a released invoice — a check has been issued. Reverse the check first." };
    }
    if (to === "void") {
      return { error: "Cannot void a released invoice — the check must be cancelled first. Contact your accountant to reverse the check issuance." };
    }
  }

  // cleared → *  — payment has landed, nothing can change.
  if (from === "cleared") {
    if (to === "disputed") {
      return { error: "Cannot dispute a cleared invoice — payment has already been made." };
    }
    if (to === "void") {
      return { error: "Cannot void a cleared invoice — payment has already been made." };
    }
  }

  // disputed → *
  if (from === "disputed") {
    if (to === "pending_review") {
      if (inv.wip_ap_posted) return await unapproveInvoice(invoiceId);
      const { error } = await supabase
        .from("invoices")
        .update({ status: "pending_review" })
        .eq("id", invoiceId);
      return error ? { error: error.message } : {};
    }
    if (to === "approved") {
      // Re-approve. If WIP/AP is already posted (e.g. dispute came from
      // pending_review which didn't reverse, or a funded-draw re-post),
      // just flip the flag. Otherwise flip to pending_review first so
      // approveInvoice's posting path runs with its status gate intact.
      if (inv.wip_ap_posted) {
        const { error } = await supabase
          .from("invoices")
          .update({ status: "approved" })
          .eq("id", invoiceId);
        return error ? { error: error.message } : {};
      }
      const { error: flipErr } = await supabase
        .from("invoices")
        .update({ status: "pending_review" })
        .eq("id", invoiceId);
      if (flipErr) return { error: flipErr.message };
      return await approveInvoice(invoiceId);
    }
    if (to === "void") return await voidFrom(invoiceId, from, !!inv.wip_ap_posted);
  }

  // void → *  — once voided, no re-opening via this path.
  return { error: `Status change from "${from}" to "${to}" is not supported.` };
}

// ---------------------------------------------------------------------------
// updateInvoice
// ---------------------------------------------------------------------------

export interface UpdateInvoiceInput {
  vendor_id: string | null;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  pending_draw: boolean;
  status: "pending_review" | "approved" | "released" | "cleared" | "disputed" | "void";
  payment_method: string;
  line_items: LineItemInput[]; // each line item has its own project_id
  project_name: string;
  contract_id: string | null;
  direct_cash_payment?: boolean;
  /** New/replacement file storage path. When provided, replaces the stored file_path. */
  file_path?: string | null;
}

export async function updateInvoice(
  invoiceId: string,
  input: UpdateInvoiceInput
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!input.vendor_id) return { error: "A vendor must be selected. Create the vendor first if they are not in the system." };

  if (input.line_items.length === 0) return { error: "At least one line item is required" };

  // Validate all line items have positive amounts
  if (input.line_items.some((li) => isNaN(li.amount) || li.amount <= 0)) {
    return { error: "All line item amounts must be positive numbers" };
  }

  // Lock check
  if (await isInFundedDraw(supabase, invoiceId)) {
    return { error: "This invoice is part of a funded draw and cannot be edited" };
  }

  // Block financial field changes on invoices with posted JEs
  const { data: jeCheck } = await supabase
    .from("invoices")
    .select("wip_ap_posted, amount, total_amount, project_id, cost_code_id")
    .eq("id", invoiceId)
    .single();

  if (jeCheck?.wip_ap_posted) {
    const newTotal = input.line_items.reduce((s, li) => s + li.amount, 0);
    const oldTotal = (jeCheck.total_amount ?? jeCheck.amount ?? 0) as number;
    const newDominant = input.line_items.reduce((max, li) => (li.amount > max.amount ? li : max));
    const newProjectId = newDominant.project_id || null;

    if (
      Math.abs(newTotal - oldTotal) > 0.005 ||
      newProjectId !== jeCheck.project_id
    ) {
      return {
        error:
          "Cannot modify amount or project on an invoice with posted journal entries. Void the invoice and re-enter it.",
      };
    }
  }

  const totalAmount = input.line_items.reduce((sum, li) => sum + li.amount, 0);
  const dominant = input.line_items.reduce((max, li) => (li.amount > max.amount ? li : max));
  const headerProjectId = dominant.project_id || null;

  const { data: dominantCode } = await supabase
    .from("cost_codes")
    .select("id")
    .eq("code", String(parseInt(dominant.cost_code) || 0))
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

  // Default due_date to invoice_date (or today) if not provided
  const dueDate = input.due_date || input.invoice_date || new Date().toISOString().split("T")[0];

  // Fetch current state before update — needed for (a) file cleanup and (b)
  // detecting a status transition that must be routed through applyStatusTransition.
  const { data: existing } = await supabase
    .from("invoices")
    .select("file_path, status")
    .eq("id", invoiceId)
    .single();
  const oldFilePath: string | null = existing?.file_path ?? null;
  const prevStatus = (existing?.status ?? "pending_review") as InvoiceStatus;

  // Status is NOT written here — any change is routed through applyStatusTransition
  // below so journal entries are posted correctly.
  const updatePayload: Record<string, unknown> = {
    project_id: headerProjectId,
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
    direct_cash_payment: input.direct_cash_payment ?? false,
    payment_method: input.payment_method || null,
    contract_id: input.contract_id || null,
    manually_reviewed: true, // editing counts as reviewing
  };
  if (input.file_path !== undefined) {
    updatePayload.file_path = input.file_path;
  }

  const { error: updateErr } = await supabase
    .from("invoices")
    .update(updatePayload)
    .eq("id", invoiceId);

  if (updateErr) return { error: updateErr.message };

  // Replace line items: insert new first, then delete old (prevents orphaned invoices on failure)
  const newLineItems = input.line_items.map((li) => ({
    invoice_id: invoiceId,
    cost_code: li.cost_code ? String(li.cost_code) : null,
    description: li.description || null,
    amount: li.amount,
    project_id: li.project_id || null,
  }));

  const { data: insertedLines, error: lineInsertErr } = await supabase
    .from("invoice_line_items")
    .insert(newLineItems)
    .select("id");

  if (lineInsertErr || !insertedLines) {
    return { error: lineInsertErr?.message ?? "Failed to insert new line items" };
  }

  // Delete old line items (exclude the ones we just inserted)
  const newIds = insertedLines.map((l) => l.id);
  const { error: lineDelErr } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", invoiceId)
    .not("id", "in", `(${newIds.join(",")})`);

  if (lineDelErr) return { error: lineDelErr.message };

  // Route any status change through the transition helper so JEs are posted
  if (input.status && input.status !== prevStatus) {
    const t = await applyStatusTransition(invoiceId, input.status);
    if (t.error) {
      revalidatePath(`/invoices/${invoiceId}`);
      revalidatePath("/invoices");
      return { error: t.error };
    }
  }

  // Clean up old storage object if the file was replaced or cleared
  if (input.file_path !== undefined && oldFilePath && oldFilePath !== input.file_path) {
    await supabase.storage.from("invoices").remove([oldFilePath]);
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return {};
}

// ---------------------------------------------------------------------------
// deleteInvoice
// ---------------------------------------------------------------------------

export async function deleteInvoice(invoiceId: string): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (await isInFundedDraw(supabase, invoiceId)) {
    return { error: "This invoice is part of a funded draw and cannot be deleted" };
  }

  // Fetch invoice for cleanup
  const { data: inv } = await supabase
    .from("invoices")
    .select("wip_ap_posted, file_path, status")
    .eq("id", invoiceId)
    .single();

  // Block deletion of invoices that have advanced past pending_review
  if (inv && inv.status !== "pending_review" && inv.status !== "disputed") {
    // If approved+, void first to reverse JEs properly
    if (inv.wip_ap_posted) {
      // Void any posted JEs for this invoice
      await supabase
        .from("journal_entries")
        .update({ status: "void" })
        .eq("source_id", invoiceId)
        .eq("status", "posted");

      // Reset wip_ap_posted
      await supabase
        .from("invoices")
        .update({ wip_ap_posted: false })
        .eq("id", invoiceId);
    }
  }

  // Remove from any draft/submitted draws
  await supabase.from("draw_invoices").delete().eq("invoice_id", invoiceId);

  // Delete payment_invoices links
  await supabase.from("payment_invoices").delete().eq("invoice_id", invoiceId);

  // Delete line items
  await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId);

  // Clean up storage file
  if (inv?.file_path) {
    await supabase.storage.from("invoices").remove([inv.file_path]);
  }

  // Delete invoice
  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) return { error: error.message };

  revalidatePath("/invoices");
  redirect("/invoices");
}

// ---------------------------------------------------------------------------
// disputeInvoice / voidInvoice / voidAfterDraw — thin wrappers over
// applyStatusTransition so the GL stays in sync. Rules:
//   - pending_review → disputed: flag-only (no JE, no WIP/AP to reverse)
//   - approved → disputed: reverse WIP/AP (DR 2000 / CR WIP)
//   - released/cleared → disputed: blocked (can't dispute after check issued)
//   - pending_review/approved → void: reverse WIP/AP if posted, then void
//   - disputed → void: reverse WIP/AP if posted (subsumes the old
//     voidAfterDraw case where a funded draw re-posted WIP/AP)
//   - released/cleared → void: blocked
// voidInvoice and voidAfterDraw resolve to the same transition — they were
// originally separate actions with identical JE logic but different entry
// gates, now unified.
// ---------------------------------------------------------------------------

export async function disputeInvoice(
  invoiceId: string
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const t = await applyStatusTransition(invoiceId, "disputed");
  if (t.error) return { error: t.error };

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return {};
}

export async function voidInvoice(
  invoiceId: string
): Promise<{ error?: string; success?: boolean }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const t = await applyStatusTransition(invoiceId, "void");
  if (t.error) return { error: t.error };

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { success: true };
}

export async function voidAfterDraw(
  invoiceId: string
): Promise<{ error?: string; success?: boolean }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const t = await applyStatusTransition(invoiceId, "void");
  if (t.error) return { error: t.error };

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { success: true };
}

export async function advanceInvoiceStatus(
  invoiceId: string,
  to: "released" | "cleared",
  paymentDate?: string,
  paymentMethod?: string,
  discountTaken?: number
): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const today = new Date().toISOString().split("T")[0];
  const discount = discountTaken && discountTaken > 0 ? discountTaken : 0;

  // Fetch + validate BEFORE any write so we never commit a status change that
  // won't have a matching JE. Also gates the UPDATE on the prerequisite status
  // (approved → released, released → cleared) to close the double-click race.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, amount, total_amount, project_id, vendor, invoice_number, discount_taken, projects ( project_type )")
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { error: "Invoice not found" };

  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  if (invoiceAmount <= 0) {
    return { error: "Invoice amount must be greater than zero" };
  }

  const requiredFromStatus = to === "released" ? "approved" : "released";
  if (invoice.status !== requiredFromStatus) {
    return {
      error: `Cannot advance invoice to '${to}' from status '${invoice.status}' — must be '${requiredFromStatus}'`,
    };
  }

  const updates: Record<string, unknown> = { status: to };
  if (to === "released") {
    updates.payment_method = paymentMethod ?? null;
    if (discount > 0) updates.discount_taken = discount;
  }
  if (to === "cleared") {
    updates.payment_date = paymentDate ?? today;
    updates.payment_method = paymentMethod ?? null;
  }

  const { data: updated, error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", invoiceId)
    .eq("status", requiredFromStatus)
    .select("id");

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) {
    return {
      error: `Invoice status changed — expected '${requiredFromStatus}'. Another process may have advanced it already.`,
    };
  }

  // Re-read discount_taken if we just wrote it, else use the fetched value.
  const savedDiscount = (to === "released" && discount > 0 ? discount : (invoice.discount_taken ?? 0)) as number;
  const netAmount = invoiceAmount - savedDiscount;
  const desc = [invoice.vendor, invoice.invoice_number]
    .filter(Boolean)
    .join(" — Inv #") || "Invoice";

  // Load line items with per-line project info for multi-project JE lines
  const { data: advLineItems } = await supabase
    .from("invoice_line_items")
    .select("amount, project_id, projects ( project_type )")
    .eq("invoice_id", invoiceId);

  // Group line item amounts by project for JE debit/credit distribution
  type ProjGroup = { projectId: string | null; wipAccountNumber: string; amount: number };
  const projGroups = new Map<string, ProjGroup>();
  for (const li of advLineItems ?? []) {
    if (!li.amount || li.amount <= 0) continue;
    const projType = (li.projects as { project_type: string } | null)?.project_type ?? null;
    const wipAcctNum = !li.project_id ? "6900" : projType === "land_development" ? "1230" : "1210";
    const key = `${wipAcctNum}|${li.project_id ?? "null"}`;
    const existing = projGroups.get(key);
    if (existing) {
      existing.amount += li.amount;
    } else {
      projGroups.set(key, { projectId: li.project_id ?? null, wipAccountNumber: wipAcctNum, amount: li.amount });
    }
  }

  if (to === "released") {
    const accountNumbers = new Set(["2000", "2050"]);
    if (savedDiscount > 0) {
      for (const g of projGroups.values()) accountNumbers.add(g.wipAccountNumber);
    }

    const acctMap = await getAccountIdMap(supabase, accountNumbers);
    const acct2000 = acctMap.get("2000");
    const acct2050 = acctMap.get("2050");

    if (acct2000 && acct2050) {
      const lines: { account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [
        {
          account_id: acct2000,
          project_id: null,
          description: `AP — ${desc}`,
          debit: invoiceAmount,
          credit: 0,
        },
        {
          account_id: acct2050,
          project_id: null,
          description: `Check issued — ${desc}`,
          debit: 0,
          credit: netAmount,
        },
      ];

      // Distribute discount credit across projects pro-rata
      if (savedDiscount > 0) {
        let distributed = 0;
        const groupArr = [...projGroups.values()];
        for (let i = 0; i < groupArr.length; i++) {
          const g = groupArr[i];
          const share = i === groupArr.length - 1
            ? savedDiscount - distributed
            : Math.round((g.amount / invoiceAmount) * savedDiscount * 100) / 100;
          distributed += share;
          if (share > 0) {
            const wipAcctId = acctMap.get(g.wipAccountNumber);
            if (wipAcctId) {
              lines.push({
                account_id: wipAcctId,
                project_id: g.projectId,
                description: `Early-pay discount — ${desc}`,
                debit: 0,
                credit: share,
              });
            }
          }
        }
      }

      await postJournalEntry(
        supabase,
        {
          entry_date: today,
          reference: `CHK-ISSUED-${invoiceId.slice(0, 8)}`,
          description: savedDiscount > 0
            ? `Check issued w/ early-pay discount $${savedDiscount.toFixed(2)} — ${desc}`
            : `Check issued — ${desc}`,
          status: "posted",
          source_type: "invoice_payment",
          source_id: invoiceId,
          user_id: user.id,
        },
        lines
      );
    }
  }

  if (to === "cleared") {
    const clearedDate = updates.payment_date as string;
    const accounts = await getAccountIdMap(supabase, ["2050", "1000"]);
    const acct2050 = accounts.get("2050");
    const acct1000 = accounts.get("1000");

    if (acct2050 && acct1000) {
      // Cleared JE is Cash-side only (DR 2050 / CR 1000) — no project split needed
      await postJournalEntry(
        supabase,
        {
          entry_date: clearedDate,
          reference: `CHK-CLR-${invoiceId.slice(0, 8)}`,
          description: `Check cleared — ${desc}`,
          status: "posted",
          source_type: "invoice_payment",
          source_id: invoiceId,
          user_id: user.id,
        },
        [
          {
            account_id: acct2050,
            project_id: null,
            description: `Outstanding check cleared — ${desc}`,
            debit: netAmount,
            credit: 0,
          },
          {
            account_id: acct1000,
            project_id: null,
            description: `Cash — ${desc}`,
            debit: 0,
            credit: netAmount,
          },
        ]
      );
    }
  }

  revalidatePath("/invoices");
  return {};
}

// ---------------------------------------------------------------------------
// payInvoiceAutoDraft
// ---------------------------------------------------------------------------
// Explicit approved → cleared transition for bank auto-drafts on invoices that
// were originally approved via the standard AP path (so DR WIP / CR AP has
// already been posted). Single JE: DR AP (2000) / CR Cash (1000). No Checks
// Outstanding (2050) hop — there is no check.
//
// Distinct from `approveInvoice({ direct_cash_payment: true })`, which is set
// at approval time and bypasses AP entirely (pending_review → cleared in one
// leg, DR WIP / CR Cash). That path is for invoices the user knows up-front
// will be auto-drafted. This path is for invoices discovered after approval
// to have been auto-drafted by the bank.
// ---------------------------------------------------------------------------

export async function payInvoiceAutoDraft(
  invoiceId: string,
  paymentDate?: string
): Promise<{ error?: string; success?: boolean }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, amount, total_amount, wip_ap_posted, project_id, vendor, vendor_id, invoice_number")
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status !== "approved") {
    return { error: `Invoice must be approved — current status is '${invoice.status}'` };
  }
  if (!invoice.wip_ap_posted) {
    return {
      error:
        "Invoice has no AP balance to clear (wip_ap_posted=false). This is a corrupt state — reset to pending_review and re-approve, or contact support.",
    };
  }

  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  if (invoiceAmount <= 0) {
    return { error: "Invoice amount must be greater than zero" };
  }

  const today = paymentDate ?? new Date().toISOString().split("T")[0];
  const desc =
    [invoice.vendor, invoice.invoice_number].filter(Boolean).join(" — Inv #") ||
    "Invoice";

  // Gate the UPDATE on status='approved' to close the TOCTOU race.
  const { data: updated, error: upErr } = await supabase
    .from("invoices")
    .update({
      status: "cleared",
      payment_date: today,
      payment_method: "ach",
    })
    .eq("id", invoiceId)
    .eq("status", "approved")
    .select("id");

  if (upErr) return { error: upErr.message };
  if (!updated || updated.length === 0) {
    return {
      error:
        "Invoice status changed — expected 'approved'. Another process may have advanced it already.",
    };
  }

  const accounts = await getAccountIdMap(supabase, ["2000", "1000"]);
  const acct2000 = accounts.get("2000");
  const acct1000 = accounts.get("1000");

  if (!acct2000 || !acct1000) {
    // Roll back the status change — we can't post the JE.
    await supabase
      .from("invoices")
      .update({ status: "approved", payment_date: null, payment_method: null })
      .eq("id", invoiceId);
    return { error: "Chart of accounts missing AP (2000) or Cash (1000) — cannot post JE" };
  }

  const jeResult = await postJournalEntry(
    supabase,
    {
      entry_date: today,
      reference: `INV-AUTODR-${invoiceId.slice(0, 8)}`,
      description: `Auto-draft payment — ${desc}`,
      status: "posted",
      source_type: "invoice_payment",
      source_id: invoiceId,
      user_id: user.id,
    },
    [
      {
        account_id: acct2000,
        project_id: null,
        description: `AP — ${desc}`,
        debit: invoiceAmount,
        credit: 0,
      },
      {
        account_id: acct1000,
        project_id: null,
        description: `Auto-draft — ${desc}`,
        debit: 0,
        credit: invoiceAmount,
      },
    ]
  );

  if (jeResult.error) {
    // Roll back the status change — the JE didn't post.
    await supabase
      .from("invoices")
      .update({ status: "approved", payment_date: null, payment_method: null })
      .eq("id", invoiceId);
    return { error: jeResult.error };
  }

  // Create a Payment Register row so bank auto-drafts appear in /banking/payments,
  // mirroring the behavior of approveInvoice's direct_cash_payment path.
  const { data: paymentRow } = await supabase
    .from("payments")
    .insert({
      payment_number: null,
      payment_method: "auto_draft",
      payee: invoice.vendor ?? "Bank",
      vendor_id: invoice.vendor_id ?? null,
      amount: invoiceAmount,
      discount_amount: 0,
      payment_date: today,
      cleared_date: today,
      status: "cleared",
      funding_source: "dda",
      draw_id: null,
      vendor_payment_id: null,
      notes: `Bank auto-draft — ${desc}`,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (paymentRow) {
    await supabase.from("payment_invoices").insert({
      payment_id: paymentRow.id,
      invoice_id: invoiceId,
      amount: invoiceAmount,
    });
  }

  revalidatePath("/invoices");
  revalidatePath("/banking/payments");
  return { success: true };
}
