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
    // ── Step 1: Build cost_code code→id lookup ────────────────────────────
    // invoice_line_items.cost_code stores the code NUMBER as text (e.g. "11")
    // but project_cost_codes.cost_code_id stores a UUID (cost_codes.id).
    // We need this map to bridge the two.
    const { data: allCostCodes, error: ccError } = await supabase
      .from("cost_codes")
      .select("id, code");

    if (ccError) {
      return { error: `Failed to fetch cost codes: ${ccError.message}` };
    }

    const codeToUuid = new Map<string, string>();
    for (const cc of allCostCodes ?? []) {
      codeToUuid.set(cc.code, cc.id);
    }

    // ── Step 2: Invoice-based costs (from line items attributed to this project) ──
    // Query invoice_line_items directly by project_id to correctly handle
    // multi-project invoices where only some line items belong to this project.
    const { data: lineItems, error: lineItemsError } = await supabase
      .from("invoice_line_items")
      .select("cost_code, amount, invoices!inner ( status )")
      .eq("project_id", projectId)
      .in("invoices.status", ["approved", "scheduled", "released", "cleared"]);

    if (lineItemsError) {
      return { error: `Failed to query line items: ${lineItemsError.message}` };
    }

    const costCodeTotals = new Map<string, number>();

    for (const item of (lineItems ?? []) as { cost_code: string; amount: number }[]) {
      // cost_code may be a code number ("11") or a UUID — handle both
      const ccId = codeToUuid.get(item.cost_code) ?? item.cost_code;
      const amount = (item.amount as number) || 0;
      if (ccId && amount !== 0) {
        const current = costCodeTotals.get(ccId) || 0;
        costCodeTotals.set(ccId, current + amount);
      }
    }

    // ── Step 3: Journal-entry-based costs (manual JEs, lot costs, etc.) ──
    // These capture owner equity contributions, land purchases, and other
    // project costs entered as JEs without an invoice — like QuickBooks
    // job-costing from any GL transaction tagged to a project.
    // We skip invoice_approval / invoice_payment source types to avoid
    // double-counting costs already captured from invoice_line_items above.
    const { data: jeLines, error: jeLinesError } = await supabase
      .from("journal_entry_lines")
      .select(
        "cost_code_id, debit, credit, journal_entry_id"
      )
      .eq("project_id", projectId)
      .not("cost_code_id", "is", null);

    if (jeLinesError) {
      return { error: `Failed to query JE lines: ${jeLinesError.message}` };
    }

    if (jeLines && jeLines.length > 0) {
      // Fetch the parent JEs to check status and source_type
      const jeIds = [...new Set(jeLines.map((l) => l.journal_entry_id))];
      const { data: parentJEs } = await supabase
        .from("journal_entries")
        .select("id, status, source_type")
        .in("id", jeIds);

      const jeMap = new Map(
        (parentJEs ?? []).map((je) => [je.id, je])
      );

      for (const line of jeLines) {
        const je = jeMap.get(line.journal_entry_id);
        if (!je || je.status !== "posted") continue;

        // Skip invoice-related JEs — those costs are already in invoice_line_items
        if (
          je.source_type === "invoice_approval" ||
          je.source_type === "invoice_payment"
        ) {
          continue;
        }

        // Net amount: debits are costs, credits are returns/adjustments
        const amount = (line.debit || 0) - (line.credit || 0);
        if (line.cost_code_id && amount !== 0) {
          const current = costCodeTotals.get(line.cost_code_id) || 0;
          costCodeTotals.set(line.cost_code_id, current + amount);
        }
      }
    }

    // ── Step 4: Update project_cost_codes ─────────────────────────────────
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
