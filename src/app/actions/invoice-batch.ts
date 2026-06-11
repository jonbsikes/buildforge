"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { approveInvoice } from "@/app/actions/invoices";
import {
  revalidateAfterInvoiceMutation,
  revalidateAfterJournalEntry,
} from "@/lib/cache";

/**
 * Approve multiple invoices at once. Skips any that are not in pending_review
 * or are low-confidence without manual review. Returns counts for UI feedback.
 */
export async function approveInvoicesBatch(
  invoiceIds: string[]
): Promise<{ error?: string; approved: number; skipped: number; errors: string[] }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error, approved: 0, skipped: 0, errors: [] };
  const errors: string[] = [];
  let approved = 0;
  let skipped = 0;
  // JE posting stays sequential (intentional, for safety); revalidation is
  // deferred to a single pass after the loop instead of once per invoice.
  for (const id of invoiceIds) {
    const r = await approveInvoice(id, { deferRevalidation: true });
    if (r.success) approved++;
    else {
      skipped++;
      if (r.error) errors.push(`${id.slice(0, 8)}: ${r.error}`);
    }
  }
  revalidateAfterJournalEntry();
  return { approved, skipped, errors };
}

/** Set pending_draw on many invoices at once. */
export async function setPendingDrawBatch(
  invoiceIds: string[],
  pending: boolean
): Promise<{ error?: string; updated: number; skipped: number }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error, updated: 0, skipped: 0 };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", updated: 0, skipped: 0 };
  if (invoiceIds.length === 0) return { updated: 0, skipped: 0 };
  // Only approved (lender pays vendor) and cleared (reimbursement) invoices
  // are draw-eligible; other statuses in the selection are skipped, not failed.
  let query = supabase
    .from("invoices")
    .update({ pending_draw: pending })
    .in("id", invoiceIds);
  if (pending) query = query.in("status", ["approved", "cleared"]);
  const { error, data } = await query.select("id");
  if (error) return { error: error.message, updated: 0, skipped: 0 };
  revalidateAfterInvoiceMutation();
  const updated = data?.length ?? 0;
  return { updated, skipped: invoiceIds.length - updated };
}
