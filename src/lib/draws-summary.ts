import type { SupabaseClient } from "@supabase/supabase-js";

/** Format ISO date (YYYY-MM-DD) as M/D/YY without timezone conversion. */
export function formatDrawDateShort(drawDate: string): string {
  const [y, m, d] = drawDate.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(-2)}`;
}

export interface DrawSummaryRow {
  project: string;
  loanNumber: string;
  category: string;
  vendor: string;
  invoiceNumber: string;
  amount: number;
}

export interface DrawSummaryGroup {
  loanNumber: string;
  rows: DrawSummaryRow[];
  subtotal: number;
}

export interface DrawSummary {
  groups: DrawSummaryGroup[];
  grandTotal: number;
}

type RawInvoice = {
  id: string;
  vendor: string | null;
  invoice_number: string | null;
  amount: number | null;
  file_path: string | null;
  projects: { id: string; name: string; address: string | null } | null;
  cost_codes: { code: string; name: string } | null;
};

type LineItem = {
  invoice_id: string;
  amount: number | null;
  project_id: string | null;
  cost_codes: { name: string } | null;
  projects: { id: string; name: string } | null;
};

export interface DrawSummaryFetch {
  invoices: RawInvoice[];
  summary: DrawSummary;
}

/**
 * Shared builder for the draw summary shown on both the Print Summary page and
 * the Download-PDF-with-Invoices route. Keeping this in one place guarantees
 * both paths show the same rows and totals.
 */
export async function fetchDrawSummary(
  supabase: SupabaseClient,
  drawId: string
): Promise<DrawSummaryFetch> {
  const { data: drawInvoices } = await supabase
    .from("draw_invoices")
    .select(`
      id,
      invoices (
        id, vendor, invoice_number, amount, file_path,
        projects ( id, name, address ),
        cost_codes ( code, name )
      )
    `)
    .eq("draw_id", drawId);

  const invoices: RawInvoice[] = (drawInvoices ?? [])
    .map((di) => di.invoices as unknown as RawInvoice | null)
    .filter((inv): inv is RawInvoice => Boolean(inv));

  const invoiceIds = invoices.map((r) => r.id);
  const lineItemsByInvoice = new Map<string, LineItem[]>();
  const lineItemProjectIds = new Set<string>();
  if (invoiceIds.length > 0) {
    const { data: lineItems } = await supabase
      .from("invoice_line_items")
      .select(`invoice_id, amount, project_id, cost_codes ( name ), projects ( id, name )`)
      .in("invoice_id", invoiceIds);
    for (const li of (lineItems ?? []) as unknown as LineItem[]) {
      if (!lineItemsByInvoice.has(li.invoice_id)) lineItemsByInvoice.set(li.invoice_id, []);
      lineItemsByInvoice.get(li.invoice_id)!.push(li);
      if (li.project_id) lineItemProjectIds.add(li.project_id);
    }
  }

  const projectIds = new Set<string>();
  for (const r of invoices) if (r.projects?.id) projectIds.add(r.projects.id);
  for (const pid of lineItemProjectIds) projectIds.add(pid);

  const loanByProject = new Map<string, string>();
  if (projectIds.size > 0) {
    const { data: loanRows } = await supabase
      .from("loans")
      .select("project_id, loan_number, created_at")
      .in("project_id", Array.from(projectIds))
      .eq("status", "active")
      .order("created_at", { ascending: false });
    for (const l of loanRows ?? []) {
      if (!loanByProject.has(l.project_id)) loanByProject.set(l.project_id, l.loan_number);
    }
  }

  const rows: DrawSummaryRow[] = [];
  for (const inv of invoices) {
    const headerProj = inv.projects;
    const vendor = inv.vendor ?? "\u2014";
    const invoiceNumber = inv.invoice_number ?? "\u2014";
    const lineItems = lineItemsByInvoice.get(inv.id) ?? [];
    if (lineItems.length > 0) {
      for (const li of lineItems) {
        const liProj = li.projects ?? headerProj;
        const project = liProj?.name ?? "\u2014";
        const loanNumber = li.project_id
          ? (loanByProject.get(li.project_id) ?? "\u2014")
          : headerProj?.id
          ? (loanByProject.get(headerProj.id) ?? "\u2014")
          : "\u2014";
        const category = li.cost_codes?.name ?? "Uncategorized";
        rows.push({ project, loanNumber, category, vendor, invoiceNumber, amount: li.amount ?? 0 });
      }
    } else {
      const project = headerProj?.name ?? "\u2014";
      const loanNumber = headerProj?.id ? (loanByProject.get(headerProj.id) ?? "\u2014") : "\u2014";
      const category = inv.cost_codes?.name ?? "\u2014";
      rows.push({ project, loanNumber, category, vendor, invoiceNumber, amount: inv.amount ?? 0 });
    }
  }

  rows.sort((a, b) => a.loanNumber.localeCompare(b.loanNumber));

  const groupMap = new Map<string, DrawSummaryGroup>();
  for (const row of rows) {
    if (!groupMap.has(row.loanNumber)) {
      groupMap.set(row.loanNumber, { loanNumber: row.loanNumber, rows: [], subtotal: 0 });
    }
    const g = groupMap.get(row.loanNumber)!;
    g.rows.push(row);
    g.subtotal += row.amount;
  }
  const groups = Array.from(groupMap.values());
  const grandTotal = groups.reduce((s, g) => s + g.subtotal, 0);

  return { invoices, summary: { groups, grandTotal } };
}
