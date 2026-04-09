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

  // User-selected at creation
  status?: "pending_review" | "approved" | "released" | "cleared" | "disputed" | "void";
  pending_draw?: boolean;
  // When the bank auto-drafts the payment, skip AP and post DR WIP / CR Cash at approval
  direct_cash_payment?: boolean;
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

  // Find dominant cost code (largest line item)
  const dominant = input.line_items.reduce((max, li) => (li.amount > max.amount ? li : max));

  // Look up the UUID for the dominant cost code
  const { data: dominantCode } = await supabase
    .from("cost_codes")
    .select("id, name")
    .eq("code", String(parseInt(dominant.cost_code) || 0))
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
      status: input.status ?? "pending_review",
      ai_confidence: input.ai_confidence,
      ai_notes: input.ai_notes || null,
      source: input.source,
      file_path: input.file_path || null,
      file_name: displayName,
      cost_code_id: dominantCode?.id ?? null,
      pending_draw: input.pending_draw ?? false,
      direct_cash_payment: input.direct_cash_payment ?? false,
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
        cost_code: li.cost_code ? String(li.cost_code) : null,
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

  // Fetch current state including fields needed for GL posting
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      status, ai_confidence, manually_reviewed, pending_draw,
      total_amount, amount, project_id, vendor, invoice_number,
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
  const projectType = (invoice.projects as { project_type: string } | null)?.project_type;
  const today = new Date().toISOString().split("T")[0];
  const invLabel = [invoice.vendor, invoice.invoice_number].filter(Boolean).join(" — Inv #") || "Invoice";

  // Determine WIP debit account:
  //   - G&A (no project): Miscellaneous Operating Expense (6900)
  //   - Land Development: CIP — Land Improvements (1230)
  //   - Home Construction: Construction WIP (1210)
  const debitAccountNumber = !invoice.project_id
    ? "6900"
    : projectType === "land_development"
    ? "1230"
    : "1210";

  if (invoice.direct_cash_payment) {
    // ── Direct cash payment path ────────────────────────────────────────────
    // Bank auto-drafted this payment. Skip AP entirely.
    // Single JE: DR WIP/CIP / CR Cash (1000)
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
      const { data: glAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number")
        .in("account_number", [debitAccountNumber, "1000"]);

      const debitAcctId = glAccounts?.find(a => a.account_number === debitAccountNumber)?.id;
      const acct1000 = glAccounts?.find(a => a.account_number === "1000")?.id;

      if (debitAcctId && acct1000) {
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
          await supabase.from("journal_entry_lines").insert([
            {
              journal_entry_id: je.id,
              account_id: debitAcctId,
              project_id: invoice.project_id ?? null,
              description: `Loan interest — ${invLabel}`,
              debit: invoiceAmount,
              credit: 0,
            },
            {
              journal_entry_id: je.id,
              account_id: acct1000,
              project_id: invoice.project_id ?? null,
              description: `Bank auto-draft — ${invLabel}`,
              debit: 0,
              credit: invoiceAmount,
            },
          ]);
        }
      }
    }
  } else {
    // ── Standard AP path ────────────────────────────────────────────────────
    // Post WIP/AP JE. fundDraw checks wip_ap_posted to prevent double-entry.

    const { error } = await supabase
      .from("invoices")
      .update({ status: "approved" })
      .eq("id", invoiceId);

    if (error) return { error: error.message };

    if (invoiceAmount > 0) {
      const { data: glAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_number")
        .in("account_number", [debitAccountNumber, "2000"]);

      const debitAcctId = glAccounts?.find(a => a.account_number === debitAccountNumber)?.id;
      const acct2000 = glAccounts?.find(a => a.account_number === "2000")?.id;

      if (debitAcctId && acct2000) {
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
          await supabase.from("journal_entry_lines").insert([
            {
              journal_entry_id: je.id,
              account_id: debitAcctId,
              project_id: invoice.project_id ?? null,
              description: invLabel,
              debit: invoiceAmount,
              credit: 0,
            },
            {
              journal_entry_id: je.id,
              account_id: acct2000,
              project_id: invoice.project_id ?? null,
              description: `AP — ${invLabel}`,
              debit: 0,
              credit: invoiceAmount,
            },
          ]);
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", invoiceId);

  if (error) return { error: error.message };
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
  status: "pending_review" | "approved" | "released" | "cleared" | "disputed" | "void";
  payment_method: string;
  line_items: LineItemInput[];
  project_name: string;
  contract_id: string | null;
  direct_cash_payment?: boolean;
}

export async function updateInvoice(
  invoiceId: string,
  input: UpdateInvoiceInput
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

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
      direct_cash_payment: input.direct_cash_payment ?? false,
      status: input.status,
      payment_method: input.payment_method || null,
      contract_id: input.contract_id || null,
      manually_reviewed: true, // editing counts as reviewing
    })
    .eq("id", invoiceId);

  if (updateErr) return { error: updateErr.message };

  // Replace line items: insert new first, then delete old (prevents orphaned invoices on failure)
  const newLineItems = input.line_items.map((li) => ({
    invoice_id: invoiceId,
    cost_code: li.cost_code ? String(li.cost_code) : null,
    description: li.description || null,
    amount: li.amount,
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

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return {};
}

// ---------------------------------------------------------------------------
// deleteInvoice
// ---------------------------------------------------------------------------

export async function deleteInvoice(invoiceId: string): Promise<{ error?: string }> {
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

export async function advanceInvoiceStatus(
  invoiceId: string,
  to: "released" | "cleared",
  paymentDate?: string,
  paymentMethod?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const today = new Date().toISOString().split("T")[0];
  const updates: Record<string, unknown> = { status: to };
  if (to === "released") {
    updates.payment_method = paymentMethod ?? null;
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

  // Load invoice details for JE posting
  const { data: invoice } = await supabase
    .from("invoices")
    .select("amount, total_amount, project_id, vendor, invoice_number")
    .eq("id", invoiceId)
    .single();

  if (!invoice) { revalidatePath("/invoices"); return {}; }

  const invoiceAmount = (invoice.total_amount ?? invoice.amount ?? 0) as number;
  const desc = [invoice.vendor, invoice.invoice_number]
    .filter(Boolean)
    .join(" — Inv #") || "Invoice";

  if (invoiceAmount <= 0) { revalidatePath("/invoices"); return {}; }

  if (to === "released") {
    // Check written: DR Accounts Payable (2000) / CR Checks Issued - Outstanding (2050)
    const { data: glAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_number")
      .in("account_number", ["2000", "2050"]);

    const acct2000 = glAccounts?.find(a => a.account_number === "2000")?.id;
    const acct2050 = glAccounts?.find(a => a.account_number === "2050")?.id;

    if (acct2000 && acct2050) {
      const { data: je } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: today,
          reference: `CHK-ISSUED-${invoiceId.slice(0, 8)}`,
          description: `Check issued — ${desc}`,
          status: "posted",
          source_type: "invoice_payment",
          source_id: invoiceId,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (je) {
        await supabase.from("journal_entry_lines").insert([
          {
            journal_entry_id: je.id,
            account_id: acct2000,
            project_id: invoice.project_id ?? null,
            description: `AP — ${desc}`,
            debit: invoiceAmount,
            credit: 0,
          },
          {
            journal_entry_id: je.id,
            account_id: acct2050,
            project_id: invoice.project_id ?? null,
            description: `Check issued — ${desc}`,
            debit: 0,
            credit: invoiceAmount,
          },
        ]);
      }
    }
  }

  if (to === "cleared") {
    // Check cleared bank: DR Checks Issued - Outstanding (2050) / CR Cash (1000)
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
        await supabase.from("journal_entry_lines").insert([
          {
            journal_entry_id: je.id,
            account_id: acct2050,
            project_id: invoice.project_id ?? null,
            description: `Outstanding check cleared — ${desc}`,
            debit: invoiceAmount,
            credit: 0,
          },
          {
            journal_entry_id: je.id,
            account_id: acct1000,
            project_id: invoice.project_id ?? null,
            description: `Cash — ${desc}`,
            debit: 0,
            credit: invoiceAmount,
          },
        ]);
      }
    }
  }

  revalidatePath("/invoices");
  return {};
}
