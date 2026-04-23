"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { approveInvoice } from "@/app/actions/invoices";

/**
 * Approve multiple invoices at once. Skips any that are not in pending_review
 * or are low-confidence without manual review. Returns counts for UI feedback.
 */
export async function approveInvoicesBatch(
  invoiceIds: string[]
): Promise<{ error?: string; approved: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let approved = 0;
  let skipped = 0;
  for (const id of invoiceIds) {
    const r = await approveInvoice(id);
    if (r.success) approved++;
    else {
      skipped++;
      if (r.error) errors.push(`${id.slice(0, 8)}: ${r.error}`);
    }
  }
  revalidatePath("/invoices");
  return { approved, skipped, errors };
}

/** Set pending_draw on many invoices at once. */
export async function setPendingDrawBatch(
  invoiceIds: string[],
  pending: boolean
): Promise<{ error?: string; updated: number }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error, updated: 0 };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", updated: 0 };
  if (invoiceIds.length === 0) return { updated: 0 };
  const { error, data } = await supabase
    .from("invoices")
    .update({ pending_draw: pending })
    .in("id", invoiceIds)
    .select("id");
  if (error) return { error: error.message, updated: 0 };
  revalidatePath("/invoices");
  return { updated: data?.length ?? 0 };
}
