// @ts-nocheck
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentInvoiceInput {
  invoice_id: string;
  amount: number;
}

export interface CreatePaymentInput {
  payment_number: string | null;   // Check #, ACH ref, wire ref
  payment_method: "check" | "ach" | "wire" | "auto_draft";
  payee: string;
  vendor_id: string | null;
  amount: number;
  payment_date: string;            // ISO date
  cleared_date: string | null;     // For ACH/wire — set at creation; checks — set later
  funding_source: "bank_funded" | "owner_funded" | "dda";
  draw_id: string | null;
  vendor_payment_id: string | null;
  notes: string | null;
  invoices: PaymentInvoiceInput[];
}

export interface PaymentRow {
  id: string;
  payment_number: string | null;
  payment_method: string;
  payee: string;
  vendor_id: string | null;
  amount: number;
  payment_date: string;
  cleared_date: string | null;
  status: string;
  funding_source: string;
  draw_id: string | null;
  notes: string | null;
  created_at: string;
  invoices: {
    id: string;
    invoice_id: string;
    amount: number;
    invoice_number: string | null;
    project_name: string | null;
    cost_code: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Helper: look up GL accounts by number
// ---------------------------------------------------------------------------

async function getGLAccounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountNumbers: string[]
): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("chart_of_accounts")
    .select("id, account_number")
    .in("account_number", accountNumbers);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.account_number] = row.id;
  }
  return map;
}

// ---------------------------------------------------------------------------
// createPayment
// Creates a payment record, links invoices, posts GL entries, and advances
// invoice statuses as appropriate.
//
// GL logic by payment method:
//   check  → DR AP (2000) / CR Checks Outstanding (2050)  — status: outstanding
//   ach    → DR AP (2000) / CR Cash (1000)                 — status: cleared
//   wire   → DR AP (2000) / CR Cash (1000)                 — status: cleared
//   auto_draft → DR AP (2000) / CR Cash (1000)             — status: cleared
// ---------------------------------------------------------------------------

export async function createPayment(
  input: CreatePaymentInput
): Promise<{ error?: string; paymentId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Validate
  if (!input.payee?.trim()) return { error: "Payee is required" };
  if (!input.amount || input.amount <= 0) return { error: "Amount must be positive" };
  if (!input.payment_date) return { error: "Payment date is required" };
  if (!input.invoices || input.invoices.length === 0)
    return { error: "At least one invoice is required" };

  // Verify invoice total matches payment amount
  const invoiceTotal = input.invoices.reduce((s, i) => s + i.amount, 0);
  const diff = Math.abs(invoiceTotal - input.amount);
  if (diff > 0.01) {
    return {
      error: `Invoice amounts ($${invoiceTotal.toFixed(2)}) don't match payment amount ($${input.amount.toFixed(2)})`,
    };
  }

  const isCheck = input.payment_method === "check";
  const paymentStatus = isCheck ? "outstanding" : "cleared";
  const clearedDate = isCheck ? null : (input.cleared_date ?? input.payment_date);

  // Insert payment record
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      payment_number: input.payment_number?.trim() || null,
      payment_method: input.payment_method,
      payee: input.payee.trim(),
      vendor_id: input.vendor_id || null,
      amount: input.amount,
      payment_date: input.payment_date,
      cleared_date: clearedDate,
      status: paymentStatus,
      funding_source: input.funding_source,
      draw_id: input.draw_id || null,
      vendor_payment_id: input.vendor_payment_id || null,
      notes: input.notes?.trim() || null,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (payErr || !payment) return { error: payErr?.message ?? "Failed to create payment" };

  // Link invoices
  const links = input.invoices.map((inv) => ({
    payment_id: payment.id,
    invoice_id: inv.invoice_id,
    amount: inv.amount,
  }));

  const { error: linkErr } = await supabase
    .from("payment_invoices")
    .insert(links);

  if (linkErr) return { error: linkErr.message };

  // Advance invoice statuses
  // For checks: invoices go to 'released'
  // For ACH/wire/auto_draft: invoices go to 'cleared'
  const newInvoiceStatus = isCheck ? "released" : "cleared";
  const invoiceIds = input.invoices.map((i) => i.invoice_id);

  const invoiceUpdates: Record<string, unknown> = {
    status: newInvoiceStatus,
    payment_method: input.payment_method === "auto_draft" ? "ach" : input.payment_method,
  };
  if (!isCheck) {
    invoiceUpdates.payment_date = clearedDate;
  }

  if (invoiceIds.length > 0) {
    await supabase
      .from("invoices")
      .update(invoiceUpdates)
      .in("id", invoiceIds);
  }

  // Post GL entries
  const glNeeded = isCheck ? ["2000", "2050"] : ["2000", "1000"];
  const accounts = await getGLAccounts(supabase, glNeeded);

  const creditAccount = isCheck ? accounts["2050"] : accounts["1000"];
  const debitAccount = accounts["2000"];

  if (debitAccount && creditAccount) {
    const ref = input.payment_number?.trim()
      ? `${isCheck ? "CHK" : input.payment_method.toUpperCase()}-${input.payment_number.trim()}`
      : `PMT-${payment.id.slice(0, 8)}`;

    const { data: je } = await supabase
      .from("journal_entries")
      .insert({
        entry_date: input.payment_date,
        reference: ref,
        description: `${isCheck ? "Check issued" : input.payment_method.toUpperCase() + " payment"} — ${input.payee}`,
        status: "posted",
        source_type: "invoice_payment",
        source_id: payment.id,
        user_id: user.id,
      })
      .select("id")
      .single();

    if (je) {
      await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: je.id,
          account_id: debitAccount,
          project_id: null,
          description: `AP cleared — ${input.payee}`,
          debit: input.amount,
          credit: 0,
        },
        {
          journal_entry_id: je.id,
          account_id: creditAccount,
          project_id: null,
          description: `${isCheck ? "Check outstanding" : "Cash"} — ${ref} — ${input.payee}`,
          debit: 0,
          credit: input.amount,
        },
      ]);
    }
  }

  revalidatePath("/banking/payments");
  revalidatePath("/invoices");
  return { paymentId: payment.id };
}

// ---------------------------------------------------------------------------
// clearPayment
// Marks a check as cleared at the bank. Posts DR 2050 / CR 1000.
// Only applies to checks with status 'outstanding'.
// ---------------------------------------------------------------------------

export async function clearPayment(
  paymentId: string,
  clearedDate: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!clearedDate) return { error: "Cleared date is required" };

  const { data: payment } = await supabase
    .from("payments")
    .select("id, payment_number, payee, amount, status, payment_method")
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found" };
  if (payment.status !== "outstanding") return { error: "Only outstanding payments can be cleared" };
  if (payment.payment_method !== "check") return { error: "Only checks can be cleared (ACH/wire clear automatically)" };

  // Update payment status
  const { error: updErr } = await supabase
    .from("payments")
    .update({ status: "cleared", cleared_date: clearedDate })
    .eq("id", paymentId);

  if (updErr) return { error: updErr.message };

  // Advance linked invoices from 'released' to 'cleared'
  const { data: links } = await supabase
    .from("payment_invoices")
    .select("invoice_id")
    .eq("payment_id", paymentId);

  const invoiceIds = (links ?? []).map((l) => l.invoice_id);
  if (invoiceIds.length > 0) {
    await supabase
      .from("invoices")
      .update({ status: "cleared", payment_date: clearedDate })
      .in("id", invoiceIds);
  }

  // Post GL: DR Checks Outstanding (2050) / CR Cash (1000)
  const accounts = await getGLAccounts(supabase, ["2050", "1000"]);
  const acct2050 = accounts["2050"];
  const acct1000 = accounts["1000"];

  if (acct2050 && acct1000) {
    const ref = payment.payment_number
      ? `CHK-CLR-${payment.payment_number}`
      : `PMT-CLR-${paymentId.slice(0, 8)}`;

    const { data: je } = await supabase
      .from("journal_entries")
      .insert({
        entry_date: clearedDate,
        reference: ref,
        description: `Check cleared — ${payment.payee}`,
        status: "posted",
        source_type: "invoice_payment",
        source_id: paymentId,
        user_id: user.id,
      })
      .select("id")
      .single();

    if (je) {
      await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: je.id,
          account_id: acct2050,
          project_id: null,
          description: `Outstanding check cleared — ${ref} — ${payment.payee}`,
          debit: payment.amount,
          credit: 0,
        },
        {
          journal_entry_id: je.id,
          account_id: acct1000,
          project_id: null,
          description: `Cash — ${ref} — ${payment.payee}`,
          debit: 0,
          credit: payment.amount,
        },
      ]);
    }
  }

  revalidatePath("/banking/payments");
  revalidatePath("/invoices");
  return {};
}

// ---------------------------------------------------------------------------
// voidPayment
// Voids a payment and reverses its GL entries.
// Reverts linked invoices back to 'approved'.
// ---------------------------------------------------------------------------

export async function voidPayment(
  paymentId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: payment } = await supabase
    .from("payments")
    .select("id, payment_number, payee, amount, status, payment_method")
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found" };
  if (payment.status === "void") return { error: "Payment is already void" };

  // Mark void
  const { error: updErr } = await supabase
    .from("payments")
    .update({ status: "void" })
    .eq("id", paymentId);

  if (updErr) return { error: updErr.message };

  // Revert linked invoices to 'approved'
  const { data: links } = await supabase
    .from("payment_invoices")
    .select("invoice_id")
    .eq("payment_id", paymentId);

  const invoiceIds = (links ?? []).map((l) => l.invoice_id);
  if (invoiceIds.length > 0) {
    await supabase
      .from("invoices")
      .update({ status: "approved", payment_date: null, payment_method: null })
      .in("id", invoiceIds);
  }

  // Reverse original GL entries by posting counter-entries
  const { data: origJEs } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("source_id", paymentId)
    .eq("status", "posted");

  for (const origJE of origJEs ?? []) {
    // Void the original
    await supabase
      .from("journal_entries")
      .update({ status: "void" })
      .eq("id", origJE.id);

    // Get original lines to create reversals
    const { data: origLines } = await supabase
      .from("journal_entry_lines")
      .select("account_id, project_id, description, debit, credit")
      .eq("journal_entry_id", origJE.id);

    if (origLines && origLines.length > 0) {
      const ref = payment.payment_number
        ? `VOID-${payment.payment_number}`
        : `VOID-${paymentId.slice(0, 8)}`;

      const { data: reverseJE } = await supabase
        .from("journal_entries")
        .insert({
          entry_date: new Date().toISOString().split("T")[0],
          reference: ref,
          description: `VOID — ${payment.payee}`,
          status: "posted",
          source_type: "invoice_payment",
          source_id: paymentId,
          user_id: user.id,
        })
        .select("id")
        .single();

      if (reverseJE) {
        const reversalLines = origLines.map((line) => ({
          journal_entry_id: reverseJE.id,
          account_id: line.account_id,
          project_id: line.project_id,
          description: `REVERSAL — ${line.description}`,
          debit: line.credit,   // Swap debit/credit
          credit: line.debit,
        }));
        await supabase.from("journal_entry_lines").insert(reversalLines);
      }
    }
  }

  revalidatePath("/banking/payments");
  revalidatePath("/invoices");
  return {};
}

// ---------------------------------------------------------------------------
// getPayments
// Fetches all payments with linked invoice details for the register view.
// ---------------------------------------------------------------------------

export async function getPayments(filters?: {
  status?: string;
  method?: string;
  dateFrom?: string;
  dateTo?: string;
  vendor?: string;
}): Promise<{ error?: string; payments?: PaymentRow[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  let query = supabase
    .from("payments")
    .select("*")
    .order("payment_date", { ascending: false });

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.method && filters.method !== "all") {
    query = query.eq("payment_method", filters.method);
  }
  if (filters?.dateFrom) {
    query = query.gte("payment_date", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("payment_date", filters.dateTo);
  }
  if (filters?.vendor) {
    query = query.ilike("payee", `%${filters.vendor}%`);
  }

  const { data: payments, error } = await query;
  if (error) return { error: error.message };

  if (!payments || payments.length === 0) return { payments: [] };

  // Fetch linked invoices for all payments
  const paymentIds = payments.map((p) => p.id);
  const { data: allLinks } = await supabase
    .from("payment_invoices")
    .select("id, payment_id, invoice_id, amount")
    .in("payment_id", paymentIds);

  // Fetch invoice details
  const invoiceIds = [...new Set((allLinks ?? []).map((l) => l.invoice_id))];
  let invoiceMap: Record<string, { invoice_number: string | null; project_name: string | null; cost_code: string | null }> = {};

  if (invoiceIds.length > 0) {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, projects ( name ), cost_codes ( code )")
      .in("id", invoiceIds);

    for (const inv of invoices ?? []) {
      invoiceMap[inv.id] = {
        invoice_number: inv.invoice_number,
        project_name: (inv.projects as { name: string } | null)?.name ?? null,
        cost_code: (inv.cost_codes as { code: number } | null)?.code?.toString() ?? null,
      };
    }
  }

  // Build response
  const result: PaymentRow[] = payments.map((p) => {
    const linkedInvoices = (allLinks ?? [])
      .filter((l) => l.payment_id === p.id)
      .map((l) => ({
        id: l.id,
        invoice_id: l.invoice_id,
        amount: l.amount,
        invoice_number: invoiceMap[l.invoice_id]?.invoice_number ?? null,
        project_name: invoiceMap[l.invoice_id]?.project_name ?? null,
        cost_code: invoiceMap[l.invoice_id]?.cost_code ?? null,
      }));

    return {
      id: p.id,
      payment_number: p.payment_number,
      payment_method: p.payment_method,
      payee: p.payee,
      vendor_id: p.vendor_id,
      amount: p.amount,
      payment_date: p.payment_date,
      cleared_date: p.cleared_date,
      status: p.status,
      funding_source: p.funding_source,
      draw_id: p.draw_id,
      notes: p.notes,
      created_at: p.created_at,
      invoices: linkedInvoices,
    };
  });

  return { payments: result };
}

// ---------------------------------------------------------------------------
// getPayableInvoices
// Returns approved invoices that can be paid (not already linked to a payment).
// Used by the "New Payment" form to select invoices.
// ---------------------------------------------------------------------------

export async function getPayableInvoices(): Promise<{
  error?: string;
  invoices?: {
    id: string;
    vendor: string | null;
    vendor_id: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    due_date: string | null;
    amount: number;
    project_name: string | null;
    project_id: string | null;
    cost_code: string | null;
  }[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get invoices that are approved (ready for payment) or released (checks already issued but could be re-linked)
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id, vendor, vendor_id, invoice_number, invoice_date, due_date,
      amount, total_amount, project_id,
      projects ( name ),
      cost_codes ( code )
    `)
    .in("status", ["approved"])
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) return { error: error.message };

  const invoices = (data ?? []).map((inv) => ({
    id: inv.id,
    vendor: inv.vendor,
    vendor_id: inv.vendor_id,
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    due_date: inv.due_date,
    amount: (inv.total_amount ?? inv.amount ?? 0) as number,
    project_name: (inv.projects as { name: string } | null)?.name ?? null,
    project_id: inv.project_id,
    cost_code: (inv.cost_codes as { code: number } | null)?.code?.toString() ?? null,
  }));

  return { invoices };
}
