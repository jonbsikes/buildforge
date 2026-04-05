// @ts-nocheck
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Syncs actual_amount for all project_cost_codes in a single project
 * by querying approved, scheduled, and paid invoices (both multi-line and single-line).
 *
 * Matching logic:
 *   - invoices.cost_code_id → cost_codes.id  (single-line invoices)
 *   - invoice_line_items.cost_code → cost_codes.id  (multi-line invoice lines)
 *   - project_cost_codes.cost_code_id → cost_codes.id
 *
 * Invoices that have line items are totalled from line_items only (to avoid double-counting).
 */
export async function syncProjectActualsFromGL(
  projectId: string
): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!projectId || typeof projectId !== "string" || projectId.trim().length === 0) {
    return { error: "Invalid project ID" };
  }

  try {
    // Step 1: Fetch all qualifying invoices for this project
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, cost_code_id, amount, total_amount")
      .eq("project_id", projectId)
      .in("status", ["approved", "scheduled", "released", "cleared"]);

    if (invoicesError) {
      return { error: `Failed to query invoices: ${invoicesError.message}` };
    }

    const invoiceList = invoices ?? [];
    const invoiceIds = invoiceList.map((inv) => inv.id);

    // Step 2: Fetch all line items for those invoices
    type LineItem = { invoice_id: string; cost_code: string; amount: number };
    let lineItems: LineItem[] = [];
    if (invoiceIds.length > 0) {
      const { data: items, error: lineItemsError } = await supabase
        .from("invoice_line_items")
        .select("invoice_id, cost_code, amount")
        .in("invoice_id", invoiceIds);

      if (lineItemsError) {
        return { error: `Failed to query line items: ${lineItemsError.message}` };
      }
      lineItems = (items ?? []) as LineItem[];
    }

    // Step 3: Determine which invoices have line items
    const invoiceIdsWithLineItems = new Set(
      lineItems.map((li) => li.invoice_id)
    );

    // Step 4: Build cost_code_id -> total amount map
    // cost_code_id is a UUID string referencing cost_codes.id
    const costCodeTotals = new Map<string, number>();

    // Multi-line invoices: sum from line items
    // invoice_line_items.cost_code is actually a UUID FK to cost_codes.id
    for (const item of lineItems) {
      const ccId = item.cost_code; // UUID string
      const amount = (item.amount as number) || 0;
      if (ccId && amount > 0) {
        const current = costCodeTotals.get(ccId) || 0;
        costCodeTotals.set(ccId, current + amount);
      }
    }

    // Single-line invoices (no line items): use invoices.cost_code_id
    for (const invoice of invoiceList) {
      if (invoiceIdsWithLineItems.has(invoice.id)) continue;
      const amount = ((invoice.total_amount ?? invoice.amount ?? 0) as number);
      const ccId = invoice.cost_code_id as string | null;
      if (ccId && amount > 0) {
        const current = costCodeTotals.get(ccId) || 0;
        costCodeTotals.set(ccId, current + amount);
      }
    }

    // Step 5: Fetch all project_cost_codes for this project
    const { data: projectCostCodes, error: pccError } = await supabase
      .from("project_cost_codes")
      .select("id, cost_code_id")
      .eq("project_id", projectId);

    if (pccError) {
      return { error: `Failed to fetch project cost codes: ${pccError.message}` };
    }

    if (!projectCostCodes || projectCostCodes.length === 0) {
      return { updated: 0 };
    }

    // Step 6: Update each project_cost_code with the computed actual_amount
    let updateCount = 0;
    for (const pcc of projectCostCodes) {
      const actualAmount = costCodeTotals.get(pcc.cost_code_id) || 0;

      const { error: updateError } = await supabase
        .from("project_cost_codes")
        .update({ actual_amount: actualAmount })
        .eq("id", pcc.id);

      if (updateError) {
        console.error(
          `Failed to update project_cost_code ${pcc.id}: ${updateError.message}`
        );
        continue;
      }

      updateCount++;
    }

    revalidatePath(`/projects/${projectId}`);
    return { updated: updateCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: `Unexpected error: ${message}` };
  }
}

/**
 * Syncs actual_amount for all project_cost_codes across all active projects.
 */
export async function syncAllProjectActuals(): Promise<{
  error?: string;
  projectCount?: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id")
      .in("status", ["active", "pre_construction"]);

    if (projectsError) {
      return { error: `Failed to fetch projects: ${projectsError.message}` };
    }

    if (!projects || projects.length === 0) {
      return { projectCount: 0 };
    }

    let successCount = 0;
    for (const project of projects) {
      const result = await syncProjectActualsFromGL(project.id);
      if (!result.error) {
        successCount++;
      } else {
        console.error(`Failed to sync project ${project.id}: ${result.error}`);
      }
    }

    revalidatePath("/projects");
    return { projectCount: successCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: `Unexpected error: ${message}` };
  }
}
