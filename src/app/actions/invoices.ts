"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

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

  // Default due_date to today if not provided, then enforce 7-day minimum from invoice_date
  let dueDate = input.due_date || new Date().toISOString().split("T")[0];
  if (input.invoice_date) {
    const minDue = new Date(input.invoice_date + "T00:00:00");
    minDue.setDate(minDue.getDate() + 7);
    const minDueStr = minDue.toISOString().split("T")[0];
    if (dueDate < minDueStr) dueDate = minDueStr;
  }

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
  if (invoice.status !== "pending_review") return { error: "Invoice is not in pending_review status" };

  // Low-confidence lock: cannot approve without manual review
  if (invoice.ai_confidence === "low" && !invoice.manually_reviewed) {
    return {
      error:
        "This invoice was flagged as low confidence by AI. Please review and edit at least one field before approving.",
    };
  }

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

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "cleared",
        payment_date: today,
        payment_method: "ach",
        wip_ap_posted: true,
      })
      .eq("id", invoiceId);

    if (error) return { error: error.message };

    if (invoiceAmount > 0) {
      allAccountNumbers.add("1000");
      const { data: glAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number")
        .in("account_number", [...allAccountNumbers]);

      const acctMap = new Map((glAccounts ?? []).map(a => [a.account_number, a.id]));
      const acct1000 = acctMap.get("1000");

      if (acct1000 && debitGroups.size > 0) {
        const { data: je } = await supabase
          .from("journal_entries")
          .insert({
            entry_date: today,
            reference: `INV-CASH-${invoiceId.slice(0, 8)}`,
            description: `Loan interest — bank auto-draft — ${invLabel}`,
            status: "posted",
            source_type: "invoice_approval",
            source_id: invoiceId,
            user_id: user.id,
          })
          .select("id")
          .single();

        if (je) {
          const jeLines: { journal_entry_id: string; account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [];

          // Debit lines per project group
          for (const g of debitGroups.values()) {
            const acctId = acctMap.get(g.accountNumber);
            if (acctId) {
              jeLines.push({
                journal_entry_id: je.id,
                account_id: acctId,
                project_id: g.projectId,
                description: `Loan interest — ${invLabel}`,
                debit: g.amount,
                credit: 0,
              });
            }
          }

          // Single credit line for Cash
          jeLines.push({
            journal_entry_id: je.id,
            account_id: acct1000,
            project_id: null,
            description: `Bank auto-draft — ${invLabel}`,
            debit: 0,
            credit: invoiceAmount,
          });

          await supabase.from("journal_entry_lines").insert(jeLines);
        }
      }
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
    // Post WIP/AP JE per line-item project. fundDraw checks wip_ap_posted to prevent double-entry.

    const { error } = await supabase
      .from("invoices")
      .update({ status: "approved" })
      .eq("id", invoiceId);

    if (error) return { error: error.message };

    if (invoiceAmount > 0) {
      allAccountNumbers.add("2000");
      const { data: glAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number")
        .in("account_number", [...allAccountNumbers]);

      const acctMap = new Map((glAccounts ?? []).map(a => [a.account_number, a.id]));
      const acct2000 = acctMap.get("2000");

      if (acct2000 && debitGroups.size > 0) {
        const { data: je } = await supabase
          .from("journal_entries")
          .insert({
            entry_date: today,
            reference: `INV-APPR-${invoiceId.slice(0, 8)}`,
            description: `Invoice approved — ${invLabel}`,
            status: "posted",
            source_type: "invoice_approval",
            source_id: invoiceId,
            user_id: user.id,
          })
          .select("id")
          .single();

        if (je) {
          const jeLines: { journal_entry_id: string; account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [];

          // Debit lines per project group
          for (const g of debitGroups.values()) {
            const acctId = acctMap.get(g.accountNumber);
            if (acctId) {
              jeLines.push({
                journal_entry_id: je.id,
                account_id: acctId,
                project_id: g.projectId,
                description: invLabel,
                debit: g.amount,
                credit: 0,
              });
            }
          }

          // Single credit line for AP
          jeLines.push({
            journal_entry_id: je.id,
            account_id: acct2000,
            project_id: null,
            description: `AP — ${invLabel}`,
            debit: 0,
            credit: invoiceAmount,
          });

          await supabase.from("journal_entry_lines").insert(jeLines);

          // Flag so fundDraw skips re-posting WIP/AP for this invoice
          await supabase
            .from("invoices")
            .update({ wip_ap_posted: true })
            .eq("id", invoiceId);
        }
      }
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

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

/**
 * Reverses a posted WIP/AP entry and flips an invoice back to pending_review.
 * Used for "un-approve" and for disputed-with-JE → pending_review transitions.
 * JE posted: DR 2000 AP / CR WIP/CIP/6900 (per line-item project).
 */
async function unapproveInvoice(invoiceId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`status, total_amount, amount, wip_ap_posted, vendor, invoice_number`)
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status === "released" || invoice.status === "cleared") {
    return { error: "Cannot un-approve a released or cleared invoice — reverse the check issuance first." };
  }
  if (await isInFundedDraw(supabase, invoiceId)) {
    return { error: "This invoice is part of a funded draw and cannot be un-approved." };
  }

  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  const today = new Date().toISOString().split("T")[0];
  const invLabel =
    [invoice.vendor, invoice.invoice_number].filter(Boolean).join(" — Inv #") || "Invoice";

  if (invoiceAmount > 0 && invoice.wip_ap_posted) {
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
      if (existing) { existing.amount += li.amount; }
      else { groups.set(key, { projectId: li.project_id ?? null, wipAccountNumber: wipAcctNum, amount: li.amount }); }
    }

    const { data: glAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_number")
      .in("account_number", [...accountNumbers]);

    const acctMap = new Map((glAccounts ?? []).map(a => [a.account_number, a.id]));
    const acct2000 = acctMap.get("2000");

    if (acct2000 && groups.size > 0) {
      const { data: je } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: today,
          reference: `INV-UNAPPR-${invoiceId.slice(0, 8)}`,
          description: `Invoice un-approved — ${invLabel}`,
          status: "posted",
          source_type: "manual",
          source_id: invoiceId,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (je) {
        const lines: { journal_entry_id: string; account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [
          {
            journal_entry_id: je.id,
            account_id: acct2000,
            project_id: null,
            description: `AP reversed — un-approve — ${invLabel}`,
            debit: invoiceAmount,
            credit: 0,
          },
        ];
        for (const g of groups.values()) {
          const wipAcctId = acctMap.get(g.wipAccountNumber);
          if (wipAcctId) {
            lines.push({
              journal_entry_id: je.id,
              account_id: wipAcctId,
              project_id: g.projectId,
              description: `WIP reversal — un-approve — ${invLabel}`,
              debit: 0,
              credit: g.amount,
            });
          }
        }
        await supabase.from("journal_entry_lines").insert(lines);
      }
    }
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "pending_review", wip_ap_posted: false })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
  return {};
}

/**
 * Router for any invoice status change. Routes to approveInvoice,
 * advanceInvoiceStatus, voidInvoice, or unapproveInvoice so that the proper
 * journal entries are posted. Direct writes to the `status` column bypass
 * the GL and must not happen elsewhere.
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

  // Flag-only flips (no JE posted by either side of the transition).
  // Note: approved/disputed both carry wip_ap_posted = true, so flipping
  // between them is just metadata and the ledger is unchanged.
  const noLedgerFlip = new Set([
    "pending_review->disputed",
    "approved->disputed",
    "disputed->approved",
  ]);
  if (noLedgerFlip.has(`${from}->${to}`)) {
    const { error } = await supabase
      .from("invoices")
      .update({ status: to })
      .eq("id", invoiceId);
    return error ? { error: error.message } : {};
  }

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
    if (to === "void") {
      const r = await voidInvoice(invoiceId);
      return r.error ? { error: r.error } : {};
    }
  }

  // disputed → pending_review: reverse WIP/AP if it was posted
  if (from === "disputed" && to === "pending_review") {
    if (inv.wip_ap_posted) return await unapproveInvoice(invoiceId);
    const { error } = await supabase
      .from("invoices")
      .update({ status: "pending_review" })
      .eq("id", invoiceId);
    return error ? { error: error.message } : {};
  }

  // disputed → void: voidInvoice handles the WIP/AP reversal if needed
  if (from === "disputed" && to === "void") {
    const r = await voidInvoice(invoiceId);
    return r.error ? { error: r.error } : {};
  }

  // approved → pending_review (un-approve)
  if (from === "approved" && to === "pending_review") {
    return await unapproveInvoice(invoiceId);
  }

  // approved → released / cleared / void
  if (from === "approved") {
    if (to === "released") return await advanceInvoiceStatus(invoiceId, "released");
    if (to === "cleared") {
      const r = await advanceInvoiceStatus(invoiceId, "released");
      if (r.error) return { error: r.error };
      return await advanceInvoiceStatus(invoiceId, "cleared");
    }
    if (to === "void") {
      const r = await voidInvoice(invoiceId);
      return r.error ? { error: r.error } : {};
    }
  }

  // released → cleared
  if (from === "released" && to === "cleared") {
    return await advanceInvoiceStatus(invoiceId, "cleared");
  }

  return { error: `Status change from "${from}" to "${to}" is not supported. Use the dedicated lifecycle actions.` };
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

  // Default due_date to today if not provided, then enforce 7-day minimum from invoice_date
  let dueDate = input.due_date || new Date().toISOString().split("T")[0];
  if (input.invoice_date) {
    const minDue = new Date(input.invoice_date + "T00:00:00");
    minDue.setDate(minDue.getDate() + 7);
    const minDueStr = minDue.toISOString().split("T")[0];
    if (dueDate < minDueStr) dueDate = minDueStr;
  }

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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("invoices")
    .update({ status: "disputed" })
    .eq("id", invoiceId);
  if (error) return { error: error.message };
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return {};
}

// ---------------------------------------------------------------------------
// voidInvoice — general void (used by the status dropdown)
// ---------------------------------------------------------------------------
// Posts the correct reversing JE based on the invoice's current state:
//   - pending_review (wip_ap_posted = false): just void, no GL work needed
//   - approved/disputed (wip_ap_posted = true): DR AP (2000) / CR WIP/CIP (1210/1230/6900)
//   - released/cleared: blocked — those need explicit reversal workflow
// ---------------------------------------------------------------------------

export async function voidInvoice(
  invoiceId: string
): Promise<{ error?: string; success?: boolean }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      status, total_amount, amount, project_id, vendor, invoice_number,
      wip_ap_posted,
      projects ( project_type )
    `)
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { error: "Invoice not found" };

  if (invoice.status === "released") {
    return { error: "Cannot void a released invoice — the check must be cancelled first. Contact your accountant to reverse the check issuance." };
  }
  if (invoice.status === "cleared") {
    return { error: "Cannot void a cleared invoice — payment has already been made." };
  }
  if (invoice.status === "void") {
    return { error: "Invoice is already voided." };
  }

  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  const today = new Date().toISOString().split("T")[0];
  const invLabel =
    [invoice.vendor, invoice.invoice_number].filter(Boolean).join(" — Inv #") || "Invoice";

  // If WIP/AP was posted, reverse it: DR AP (2000) / CR WIP/CIP per line-item project
  if (invoiceAmount > 0 && invoice.wip_ap_posted) {
    // Load line items with per-line project info
    const { data: voidLineItems } = await supabase
      .from("invoice_line_items")
      .select("amount, project_id, projects ( project_type )")
      .eq("invoice_id", invoiceId);

    // Group by project for reversal JE
    const accountNumbers = new Set(["2000"]);
    type VoidGroup = { projectId: string | null; wipAccountNumber: string; amount: number };
    const voidGroups = new Map<string, VoidGroup>();
    for (const li of voidLineItems ?? []) {
      if (!li.amount || li.amount <= 0) continue;
      const projType = (li.projects as { project_type: string } | null)?.project_type ?? null;
      const wipAcctNum = !li.project_id ? "6900" : projType === "land_development" ? "1230" : "1210";
      accountNumbers.add(wipAcctNum);
      const key = `${wipAcctNum}|${li.project_id ?? "null"}`;
      const existing = voidGroups.get(key);
      if (existing) { existing.amount += li.amount; }
      else { voidGroups.set(key, { projectId: li.project_id ?? null, wipAccountNumber: wipAcctNum, amount: li.amount }); }
    }

    const { data: glAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_number")
      .in("account_number", [...accountNumbers]);

    const acctMap = new Map((glAccounts ?? []).map(a => [a.account_number, a.id]));
    const acct2000 = acctMap.get("2000");

    if (acct2000 && voidGroups.size > 0) {
      const { data: je } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: today,
          reference: `VOID-${invoiceId.slice(0, 8)}`,
          description: `Invoice voided — ${invLabel}`,
          status: "posted",
          source_type: "manual",
          source_id: invoiceId,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (je) {
        const jeLines: { journal_entry_id: string; account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [
          {
            journal_entry_id: je.id,
            account_id: acct2000,
            project_id: null,
            description: `AP cleared — invoice voided — ${invLabel}`,
            debit: invoiceAmount,
            credit: 0,
          },
        ];
        for (const g of voidGroups.values()) {
          const wipAcctId = acctMap.get(g.wipAccountNumber);
          if (wipAcctId) {
            jeLines.push({
              journal_entry_id: je.id,
              account_id: wipAcctId,
              project_id: g.projectId,
              description: `WIP reversal — invoice voided — ${invLabel}`,
              debit: 0,
              credit: g.amount,
            });
          }
        }
        await supabase.from("journal_entry_lines").insert(jeLines);
      }
    }
  }

  const { error: voidError } = await supabase
    .from("invoices")
    .update({ status: "void", pending_draw: false })
    .eq("id", invoiceId);

  if (voidError) return { error: voidError.message };

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { success: true };
}

// ---------------------------------------------------------------------------
// voidAfterDraw
// ---------------------------------------------------------------------------
// Used when a disputed invoice was already drawn on (bank funded the draw),
// but the vendor will not be paid. Cash and loan payable remain unchanged.
// Posts: DR Accounts Payable (2000) / CR WIP/CIP (1210/1230/6900)
// This clears the AP liability and reduces project cost.
// ---------------------------------------------------------------------------

export async function voidAfterDraw(
  invoiceId: string
): Promise<{ error?: string; success?: boolean }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      status, total_amount, amount, project_id, vendor, invoice_number,
      wip_ap_posted,
      projects ( project_type )
    `)
    .eq("id", invoiceId)
    .single();

  if (!invoice) return { error: "Invoice not found" };
  if (invoice.status !== "disputed") {
    return { error: "Only disputed invoices can be voided this way" };
  }

  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  const today = new Date().toISOString().split("T")[0];
  const invLabel =
    [invoice.vendor, invoice.invoice_number].filter(Boolean).join(" — Inv #") || "Invoice";

  // Only post the clearing JE if WIP/AP was actually posted (wip_ap_posted = true).
  if (invoiceAmount > 0 && invoice.wip_ap_posted) {
    // Load line items with per-line project info for per-project reversal
    const { data: vadLineItems } = await supabase
      .from("invoice_line_items")
      .select("amount, project_id, projects ( project_type )")
      .eq("invoice_id", invoiceId);

    const accountNumbers = new Set(["2000"]);
    type VadGroup = { projectId: string | null; wipAccountNumber: string; amount: number };
    const vadGroups = new Map<string, VadGroup>();
    for (const li of vadLineItems ?? []) {
      if (!li.amount || li.amount <= 0) continue;
      const projType = (li.projects as { project_type: string } | null)?.project_type ?? null;
      const wipAcctNum = !li.project_id ? "6900" : projType === "land_development" ? "1230" : "1210";
      accountNumbers.add(wipAcctNum);
      const key = `${wipAcctNum}|${li.project_id ?? "null"}`;
      const existing = vadGroups.get(key);
      if (existing) { existing.amount += li.amount; }
      else { vadGroups.set(key, { projectId: li.project_id ?? null, wipAccountNumber: wipAcctNum, amount: li.amount }); }
    }

    const { data: glAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_number")
      .in("account_number", [...accountNumbers]);

    const acctMap = new Map((glAccounts ?? []).map(a => [a.account_number, a.id]));
    const acct2000 = acctMap.get("2000");

    if (acct2000 && vadGroups.size > 0) {
      const { data: je } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: today,
          reference: `VOID-DRAWN-${invoiceId.slice(0, 8)}`,
          description: `Void after draw — vendor not paid — ${invLabel}`,
          status: "posted",
          source_type: "manual",
          source_id: invoiceId,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (je) {
        const jeLines: { journal_entry_id: string; account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [
          {
            journal_entry_id: je.id,
            account_id: acct2000,
            project_id: null,
            description: `AP cleared — vendor not paid — ${invLabel}`,
            debit: invoiceAmount,
            credit: 0,
          },
        ];
        for (const g of vadGroups.values()) {
          const wipAcctId = acctMap.get(g.wipAccountNumber);
          if (wipAcctId) {
            jeLines.push({
              journal_entry_id: je.id,
              account_id: wipAcctId,
              project_id: g.projectId,
              description: `WIP reduction — disputed invoice voided — ${invLabel}`,
              debit: 0,
              credit: g.amount,
            });
          }
        }
        await supabase.from("journal_entry_lines").insert(jeLines);
      }
    }
  }

  // Mark invoice void and remove from any pending draw queue
  const { error: voidError } = await supabase
    .from("invoices")
    .update({ status: "void", pending_draw: false })
    .eq("id", invoiceId);

  if (voidError) return { error: voidError.message };

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
  const updates: Record<string, unknown> = { status: to };
  if (to === "released") {
    updates.payment_method = paymentMethod ?? null;
    if (discount > 0) updates.discount_taken = discount;
  }
  if (to === "cleared") {
    updates.payment_date = paymentDate ?? today;
    updates.payment_method = paymentMethod ?? null;
  }

  const { error } = await supabase
    .from("invoices")
    .update(updates)
    .eq("id", invoiceId);

  if (error) return { error: error.message };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("amount, total_amount, project_id, vendor, invoice_number, discount_taken, projects ( project_type )")
    .eq("id", invoiceId)
    .single();

  if (!invoice) { revalidatePath("/invoices"); return {}; }

  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  const savedDiscount = (invoice.discount_taken ?? 0) as number;
  const netAmount = invoiceAmount - savedDiscount;
  const desc = [invoice.vendor, invoice.invoice_number]
    .filter(Boolean)
    .join(" — Inv #") || "Invoice";

  if (invoiceAmount <= 0) { revalidatePath("/invoices"); return {}; }

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

    const { data: glAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_number")
      .in("account_number", [...accountNumbers]);

    const acctMap = new Map((glAccounts ?? []).map(a => [a.account_number, a.id]));
    const acct2000 = acctMap.get("2000");
    const acct2050 = acctMap.get("2050");

    if (acct2000 && acct2050) {
      const { data: je } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: today,
          reference: `CHK-ISSUED-${invoiceId.slice(0, 8)}`,
          description: savedDiscount > 0
            ? `Check issued w/ early-pay discount $${savedDiscount.toFixed(2)} — ${desc}`
            : `Check issued — ${desc}`,
          status: "posted",
          source_type: "invoice_payment",
          source_id: invoiceId,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (je) {
        const lines: { journal_entry_id: string; account_id: string; project_id: string | null; description: string; debit: number; credit: number }[] = [
          {
            journal_entry_id: je.id,
            account_id: acct2000,
            project_id: null,
            description: `AP — ${desc}`,
            debit: invoiceAmount,
            credit: 0,
          },
          {
            journal_entry_id: je.id,
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
                  journal_entry_id: je.id,
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

        await supabase.from("journal_entry_lines").insert(lines);
      }
    }
  }

  if (to === "cleared") {
    const clearedDate = updates.payment_date as string;
    const { data: glAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_number")
      .in("account_number", ["2050", "1000"]);

    const acct2050 = glAccounts?.find(a => a.account_number === "2050")?.id;
    const acct1000 = glAccounts?.find(a => a.account_number === "1000")?.id;

    if (acct2050 && acct1000) {
      const { data: je } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: clearedDate,
          reference: `CHK-CLR-${invoiceId.slice(0, 8)}`,
          description: `Check cleared — ${desc}`,
          status: "posted",
          source_type: "invoice_payment",
          source_id: invoiceId,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (je) {
        // Cleared JE is Cash-side only (DR 2050 / CR 1000) — no project split needed
        await supabase.from("journal_entry_lines").insert([
          {
            journal_entry_id: je.id,
            account_id: acct2050,
            project_id: null,
            description: `Outstanding check cleared — ${desc}`,
            debit: netAmount,
            credit: 0,
          },
          {
            journal_entry_id: je.id,
            account_id: acct1000,
            project_id: null,
            description: `Cash — ${desc}`,
            debit: 0,
            credit: netAmount,
          },
        ]);
      }
    }
  }

  revalidatePath("/invoices");
  return {};
}
