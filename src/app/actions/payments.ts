"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { approveInvoice } from "./invoices";
import { getAccountIdMap } from "@/lib/gl/accounts";
import { postJournalEntry } from "@/lib/gl/postEntry";

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
  amount: number;                  // Gross invoice total (before discount)
  discount_amount: number;         // Early-pay discount in dollars (net = amount - discount)
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
  discount_amount: number;
  payment_date: string;
  cleared_date: string | null;
  status: string;
  funding_source: string;
  draw_id: string | null;
  vendor_payment_id: string | null;
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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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

  // Verify invoice total matches payment amount (gross, before discount)
  const invoiceTotal = input.invoices.reduce((s, i) => s + i.amount, 0);
  const diff = Math.abs(invoiceTotal - input.amount);
  if (diff > 0.01) {
    return {
      error: `Invoice amounts ($${invoiceTotal.toFixed(2)}) don't match payment amount ($${input.amount.toFixed(2)})`,
    };
  }

  const discount = input.discount_amount && input.discount_amount > 0 ? input.discount_amount : 0;
  if (discount >= input.amount) {
    return { error: "Discount cannot be greater than or equal to the payment amount" };
  }
  const netAmount = Math.round((input.amount - discount) * 100) / 100;

  const isCheck = input.payment_method === "check";
  const paymentStatus = isCheck ? "outstanding" : "cleared";
  const clearedDate = isCheck ? null : (input.cleared_date ?? input.payment_date);
  const newInvoiceStatus = isCheck ? "released" : "cleared";
  const invoiceIds = input.invoices.map((i) => i.invoice_id);

  // ---------------------------------------------------------------------------
  // Prerequisite check — MUST run before the payments row is inserted.
  //
  // Ensures every linked invoice has had its DR WIP/CIP / CR AP entry posted
  // (wip_ap_posted = true). Without this, the payment JE below would post
  // DR AP / CR Cash against an AP balance that was never opened — leaving
  // WIP/CIP un-debited and AP with a phantom negative balance.
  //
  // If an invoice is still in pending_review we auto-approve it here so the
  // approval leg is posted first. Any other status combined with
  // wip_ap_posted = false is a corrupt state and we refuse to proceed.
  //
  // Ordering matters: running this BEFORE the payment insert means any
  // failure leaves no dangling `payments` row. If an auto-approval succeeds
  // for invoice #1 then fails for #2, invoice #1's WIP/AP entry is durable
  // (correct — the invoice was in fact approved), but there is no orphan
  // payment record to reconcile.
  // ---------------------------------------------------------------------------
  for (const invId of invoiceIds) {
    const { data: invCheck } = await supabase
      .from("invoices")
      .select("status, wip_ap_posted, direct_cash_payment, invoice_number")
      .eq("id", invId)
      .single();
    if (!invCheck) continue;

    // The bulk status update at the end of this function gates on
    // status='approved'. Anything in 'released', 'cleared', 'disputed', 'void'
    // would silently fail that gate and leave a dangling payment row. Refuse
    // up front before we write anything.
    if (invCheck.wip_ap_posted) {
      if (invCheck.status !== "approved") {
        return {
          error: `Invoice ${invCheck.invoice_number ?? invId} is in status '${invCheck.status}' — only approved invoices can be paid.`,
        };
      }
      continue; // approval leg already posted; ready to pay
    }

    if (invCheck.status !== "pending_review") {
      return {
        error: `Invoice ${invCheck.invoice_number ?? invId} is in status '${invCheck.status}' with wip_ap_posted=false. This is a corrupt state — reset the invoice to pending_review and retry, or contact support.`,
      };
    }

    // createPayment posts the standard two-leg path (DR AP / CR Cash). If the
    // invoice was flagged direct_cash_payment, approveInvoice would post a
    // one-leg DR WIP / CR Cash entry and there would be no AP balance for us
    // to debit. Flip the flag off so approveInvoice runs the two-leg path.
    if (invCheck.direct_cash_payment) {
      const { error: flipErr } = await supabase
        .from("invoices")
        .update({ direct_cash_payment: false })
        .eq("id", invId);
      if (flipErr) return { error: flipErr.message };
    }

    const { error: approveErr } = await approveInvoice(invId);
    if (approveErr) {
      return { error: `Failed to auto-approve invoice ${invCheck.invoice_number ?? invId} before payment: ${approveErr}` };
    }
  }

  // Insert payment record (only after all prerequisites clear)
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      payment_number: input.payment_number?.trim() || null,
      payment_method: input.payment_method,
      payee: input.payee.trim(),
      vendor_id: input.vendor_id || null,
      amount: input.amount,
      discount_amount: discount,
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

  const invoiceUpdates: Record<string, unknown> = {
    status: newInvoiceStatus,
    payment_method: input.payment_method === "auto_draft" ? "ach" : input.payment_method,
  };
  if (!isCheck) {
    invoiceUpdates.payment_date = clearedDate;
  }

  if (invoiceIds.length > 0) {
    // Status-gated update — every invoice must currently be in 'approved'
    // (set by the prerequisite loop above). If anything raced in between
    // (rare; single-user today) we want to surface it rather than silently
    // overwrite a 'released' / 'cleared' / 'disputed' status.
    const { data: updated, error: updateErr } = await supabase
      .from("invoices")
      .update(invoiceUpdates)
      .in("id", invoiceIds)
      .eq("status", "approved")
      .select("id");

    if (updateErr) return { error: updateErr.message };
    if (!updated || updated.length !== invoiceIds.length) {
      return {
        error: `Concurrent invoice status change detected — ${updated?.length ?? 0} of ${invoiceIds.length} invoices updated. Reload and retry.`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Sync vendor_payments on any draw that contains these invoices.
  //
  // Context: the draw detail page reads vendor_payments.status to decide
  // whether each vendor line on the draw is "open" or "paid". If the user
  // pays an invoice via the Payment Register (this action) instead of via
  // the draw's "Mark Vendor Paid" workflow, those vendor_payments rows are
  // never updated and the draw page keeps showing the line as open.
  //
  // We close the loop here: for every vendor_payment whose invoice set is
  // fully covered by this payment, mark it paid and stamp the check info.
  // If that paid the last open line on a draw, auto-close the draw.
  //
  // No GL entries are posted here — createPayment has already posted the
  // DR AP / CR 2050 (or 1000) entry. This is purely a status sync.
  // ---------------------------------------------------------------------------
  const affectedDrawIds = new Set<string>();
  if (invoiceIds.length > 0) {
    const paidSet = new Set<string>(invoiceIds);

    const { data: vpLinks } = await supabase
      .from("vendor_payment_invoices")
      .select("vendor_payment_id, invoice_id")
      .in("invoice_id", invoiceIds);

    const candidateVpIds = Array.from(
      new Set((vpLinks ?? []).map((l) => l.vendor_payment_id))
    );

    if (candidateVpIds.length > 0) {
      // Load every vendor_payment involved and all of its invoice links so
      // we can tell which ones are fully covered by this payment.
      const { data: vps } = await supabase
        .from("vendor_payments")
        .select("id, draw_id, status")
        .in("id", candidateVpIds);

      const { data: allLinks } = await supabase
        .from("vendor_payment_invoices")
        .select("vendor_payment_id, invoice_id")
        .in("vendor_payment_id", candidateVpIds);

      const invoicesByVp = new Map<string, string[]>();
      for (const l of allLinks ?? []) {
        const arr = invoicesByVp.get(l.vendor_payment_id) ?? [];
        arr.push(l.invoice_id);
        invoicesByVp.set(l.vendor_payment_id, arr);
      }

      for (const vp of vps ?? []) {
        if (vp.status === "paid") {
          if (vp.draw_id) affectedDrawIds.add(vp.draw_id);
          continue;
        }
        const linkedInvoiceIds = invoicesByVp.get(vp.id) ?? [];
        if (linkedInvoiceIds.length === 0) continue;
        const fullyCovered = linkedInvoiceIds.every((id) => paidSet.has(id));
        if (!fullyCovered) continue;

        await supabase
          .from("vendor_payments")
          .update({
            status: "paid",
            check_number: input.payment_number?.trim() || null,
            payment_date: input.payment_date,
          })
          .eq("id", vp.id);

        if (vp.draw_id) affectedDrawIds.add(vp.draw_id);
      }
    }

    // Auto-close any draw whose vendor_payments are now all paid.
    for (const drawId of affectedDrawIds) {
      const { data: allVps } = await supabase
        .from("vendor_payments")
        .select("status")
        .eq("draw_id", drawId);
      if (!allVps || allVps.length === 0) continue;
      const allPaid = allVps.every((v) => v.status === "paid");
      if (allPaid) {
        await supabase
          .from("loan_draws")
          .update({ status: "paid" })
          .eq("id", drawId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // If discount taken, distribute across invoices and determine WIP accounts
  // ---------------------------------------------------------------------------
  type DiscountByWip = { accountNumber: string; projectId: string | null; amount: number };
  const discountsByWip: DiscountByWip[] = [];

  if (discount > 0 && invoiceIds.length > 0) {
    const { data: invoiceDetails } = await supabase
      .from("invoices")
      .select("id, total_amount, amount, project_id, projects ( project_type )")
      .in("id", invoiceIds);

    if (invoiceDetails && invoiceDetails.length > 0) {
      const totalInvAmt = invoiceDetails.reduce(
        (s, inv) => s + ((inv.total_amount ?? inv.amount ?? 0) as number), 0
      );

      // Read prior discount_taken on each invoice so we accumulate, not overwrite.
      // Re-paying after a void should sum, not erase the historical discount.
      const { data: priorDiscounts } = await supabase
        .from("invoices")
        .select("id, discount_taken")
        .in("id", invoiceIds);
      const priorMap = new Map<string, number>(
        (priorDiscounts ?? []).map((r) => [r.id, (r.discount_taken ?? 0) as number])
      );

      let distributed = 0;
      for (let i = 0; i < invoiceDetails.length; i++) {
        const inv = invoiceDetails[i];
        const invAmt = (inv.total_amount ?? inv.amount ?? 0) as number;
        const share = i === invoiceDetails.length - 1
          ? discount - distributed
          : Math.round((invAmt / totalInvAmt) * discount * 100) / 100;
        distributed += share;

        if (share > 0) {
          // Save discount on the invoice record (accumulate vs overwrite)
          const prior = priorMap.get(inv.id) ?? 0;
          await supabase
            .from("invoices")
            .update({ discount_taken: Math.round((prior + share) * 100) / 100 })
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

  // ---------------------------------------------------------------------------
  // Post GL entries
  // DR AP (full amount) / CR 2050 or 1000 (net) / CR WIP per project (discount)
  // ---------------------------------------------------------------------------
  const glNeeded = isCheck ? ["2000", "2050"] : ["2000", "1000"];
  if (discount > 0) {
    for (const d of discountsByWip) {
      if (!glNeeded.includes(d.accountNumber)) glNeeded.push(d.accountNumber);
    }
  }
  const accounts = await getAccountIdMap(supabase, glNeeded);

  const creditAccount = isCheck ? accounts.get("2050") : accounts.get("1000");
  const debitAccount = accounts.get("2000");

  if (debitAccount && creditAccount) {
    const ref = input.payment_number?.trim()
      ? `${isCheck ? "CHK" : input.payment_method.toUpperCase()}-${input.payment_number.trim()}`
      : `PMT-${payment.id.slice(0, 8)}`;

    const lines: Array<{
      account_id: string;
      project_id: string | null;
      description: string;
      debit: number;
      credit: number;
    }> = [
      {
        account_id: debitAccount,
        project_id: null,
        description: `AP cleared — ${input.payee}`,
        debit: input.amount,
        credit: 0,
      },
      {
        account_id: creditAccount,
        project_id: null,
        description: `${isCheck ? "Check outstanding" : "Cash"} — ${ref} — ${input.payee}`,
        debit: 0,
        credit: netAmount,
      },
    ];

    // Add discount credit lines to WIP/CIP per project
    if (discount > 0) {
      for (const d of discountsByWip) {
        const wipAcctId = accounts.get(d.accountNumber);
        if (wipAcctId) {
          lines.push({
            account_id: wipAcctId,
            project_id: d.projectId,
            description: `Early-pay discount — ${ref} — ${input.payee}`,
            debit: 0,
            credit: d.amount,
          });
        }
      }
    }

    await postJournalEntry(
      supabase,
      {
        entry_date: input.payment_date,
        reference: ref,
        description: discount > 0
          ? `${isCheck ? "Check issued" : input.payment_method.toUpperCase() + " payment"} w/ $${discount.toFixed(2)} early-pay discount — ${input.payee}`
          : `${isCheck ? "Check issued" : input.payment_method.toUpperCase() + " payment"} — ${input.payee}`,
        status: "posted",
        source_type: "invoice_payment",
        source_id: payment.id,
        user_id: user.id,
      },
      lines
    );
  }

  revalidatePath("/banking/payments");
  revalidatePath("/invoices");
  if (affectedDrawIds.size > 0) {
    revalidatePath("/draws");
    for (const drawId of affectedDrawIds) {
      revalidatePath(`/draws/${drawId}`);
    }
  }
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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!clearedDate) return { error: "Cleared date is required" };

  const { data: payment } = await supabase
    .from("payments")
    .select("id, payment_number, payee, amount, discount_amount, status, payment_method")
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found" };
  if (payment.status !== "outstanding") return { error: "Only outstanding payments can be cleared" };
  if (payment.payment_method !== "check") return { error: "Only checks can be cleared (ACH/wire clear automatically)" };

  // Net amount is what's actually in 2050 (Checks Outstanding)
  const discountAmt = (payment.discount_amount ?? 0) as number;
  const netClearAmount = payment.amount - discountAmt;

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
  // Uses net amount (after discount) since that's what sits in 2050
  const accounts = await getAccountIdMap(supabase, ["2050", "1000"]);
  const acct2050 = accounts.get("2050");
  const acct1000 = accounts.get("1000");

  if (acct2050 && acct1000) {
    const ref = payment.payment_number
      ? `CHK-CLR-${payment.payment_number}`
      : `PMT-CLR-${paymentId.slice(0, 8)}`;

    await postJournalEntry(
      supabase,
      {
        entry_date: clearedDate,
        reference: ref,
        description: `Check cleared — ${payment.payee}`,
        status: "posted",
        source_type: "invoice_payment",
        source_id: paymentId,
        user_id: user.id,
      },
      [
        {
          account_id: acct2050,
          project_id: null,
          description: `Outstanding check cleared — ${ref} — ${payment.payee}`,
          debit: netClearAmount,
          credit: 0,
        },
        {
          account_id: acct1000,
          project_id: null,
          description: `Cash — ${ref} — ${payment.payee}`,
          debit: 0,
          credit: netClearAmount,
        },
      ]
    );
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
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

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

  // Pre-validate linked invoice statuses BEFORE any writes. A 'cleared'
  // invoice means the check has cleared the bank — voiding the payment
  // would silently rewrite that to 'approved' and erase the audit trail.
  // Mirrors the rule applied to disputeInvoice / voidInvoice in Step 4.
  const { data: links } = await supabase
    .from("payment_invoices")
    .select("invoice_id")
    .eq("payment_id", paymentId);

  const invoiceIds = (links ?? []).map((l) => l.invoice_id);

  if (invoiceIds.length > 0) {
    const { data: linkedInvoices } = await supabase
      .from("invoices")
      .select("id, status, invoice_number")
      .in("id", invoiceIds);

    const cleared = (linkedInvoices ?? []).filter((i) => i.status === "cleared");
    if (cleared.length > 0) {
      const refs = cleared.map((i) => i.invoice_number ?? i.id.slice(0, 8)).join(", ");
      return {
        error: `Cannot void — ${cleared.length} linked invoice(s) already cleared the bank: ${refs}. Reverse the bank clearing first if this was a bank reversal.`,
      };
    }
  }

  // Mark void
  const { error: updErr } = await supabase
    .from("payments")
    .update({ status: "void" })
    .eq("id", paymentId);

  if (updErr) return { error: updErr.message };

  if (invoiceIds.length > 0) {
    // Status-gated revert: only invoices currently in 'released' should be
    // walked back to 'approved'. Already-approved (e.g. partially-paid in
    // future) stays put.
    await supabase
      .from("invoices")
      .update({ status: "approved", payment_date: null, payment_method: null })
      .in("id", invoiceIds)
      .eq("status", "released");
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

      await postJournalEntry(
        supabase,
        {
          entry_date: new Date().toISOString().split("T")[0],
          reference: ref,
          description: `VOID — ${payment.payee}`,
          status: "posted",
          source_type: "invoice_payment",
          source_id: paymentId,
          user_id: user.id,
        },
        origLines.map((line) => ({
          account_id: line.account_id,
          project_id: line.project_id,
          description: `REVERSAL — ${line.description}`,
          debit: line.credit,   // Swap debit/credit
          credit: line.debit,
        }))
      );
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
      discount_amount: p.discount_amount ?? 0,
      payment_date: p.payment_date,
      cleared_date: p.cleared_date,
      status: p.status,
      funding_source: p.funding_source,
      draw_id: p.draw_id,
      vendor_payment_id: p.vendor_payment_id,
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

// ---------------------------------------------------------------------------
// getReleasedUnlinkedInvoices
// Returns invoices that are in 'released' status but have no payment record
// linked yet. These are checks that were written before the payment register
// existed and need to be backfilled.
// ---------------------------------------------------------------------------

export async function getReleasedUnlinkedInvoices(): Promise<{
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
    payment_method: string | null;
  }[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // All released invoices
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id, vendor, vendor_id, invoice_number, invoice_date, due_date,
      amount, total_amount, project_id, payment_method,
      projects ( name ),
      cost_codes ( code )
    `)
    .eq("status", "released")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { invoices: [] };

  // Filter out any that are already linked to a payment
  const allIds = data.map((inv) => inv.id);
  const { data: linked } = await supabase
    .from("payment_invoices")
    .select("invoice_id")
    .in("invoice_id", allIds);

  const linkedSet = new Set((linked ?? []).map((l) => l.invoice_id));

  const invoices = data
    .filter((inv) => !linkedSet.has(inv.id))
    .map((inv) => ({
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
      payment_method: inv.payment_method,
    }));

  return { invoices };
}

// ---------------------------------------------------------------------------
// backfillPayment
// Creates a payment record and links invoices for checks that were already
// issued before the payment register existed. These invoices are in 'released'
// status and already have GL entries posted (DR AP / CR 2050), so this action
// creates the payment record ONLY — no new GL entries are posted.
// ---------------------------------------------------------------------------

export async function backfillPayment(input: {
  payment_number: string | null;
  payment_method: "check" | "ach" | "wire";
  payee: string;
  vendor_id: string | null;
  amount: number;
  payment_date: string;
  funding_source: "bank_funded" | "owner_funded" | "dda";
  notes: string | null;
  invoices: { invoice_id: string; amount: number }[];
}): Promise<{ error?: string; paymentId?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!input.payee?.trim()) return { error: "Payee is required" };
  if (!input.amount || input.amount <= 0) return { error: "Amount must be positive" };
  if (!input.payment_date) return { error: "Payment date is required" };
  if (!input.invoices || input.invoices.length === 0)
    return { error: "At least one invoice is required" };

  const isCheck = input.payment_method === "check";

  // Insert payment record. Checks stay 'outstanding'; ACH/wire mark 'cleared'.
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      payment_number: input.payment_number?.trim() || null,
      payment_method: input.payment_method,
      payee: input.payee.trim(),
      vendor_id: input.vendor_id || null,
      amount: input.amount,
      discount_amount: 0,
      payment_date: input.payment_date,
      cleared_date: isCheck ? null : input.payment_date,
      status: isCheck ? "outstanding" : "cleared",
      funding_source: input.funding_source,
      draw_id: null,
      vendor_payment_id: null,
      notes: input.notes?.trim() || null,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (payErr || !payment) return { error: payErr?.message ?? "Failed to create payment" };

  // Link invoices
  const { error: linkErr } = await supabase
    .from("payment_invoices")
    .insert(
      input.invoices.map((inv) => ({
        payment_id: payment.id,
        invoice_id: inv.invoice_id,
        amount: inv.amount,
      }))
    );

  if (linkErr) return { error: linkErr.message };

  // No GL posting — the DR AP / CR 2050 entries already exist from advanceInvoiceStatus.

  revalidatePath("/banking/payments");
  revalidatePath("/invoices");
  return { paymentId: payment.id };
}
