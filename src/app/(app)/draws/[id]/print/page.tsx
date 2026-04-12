import React from "react";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { drawDisplayName } from "@/lib/draws";
import DrawPrintClient from "@/components/draws/DrawPrintClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function fmt(n: number | null) {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

interface PrintRow {
  project: string;
  loanNumber: string;
  category: string;
  vendor: string;
  invoiceNumber: string;
  amount: number;
}

export default async function DrawPrintPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: draw } = await supabase
    .from("loan_draws")
    .select(`id, draw_number, draw_date, total_amount, status, notes, contacts ( id, name )`)
    .eq("id", id)
    .single();

  if (!draw) notFound();

  const { data: drawInvoices } = await supabase
    .from("draw_invoices")
    .select(`
      id,
      invoices (
        id, vendor, invoice_number, amount, file_path, file_name,
        projects ( id, name, address ),
        cost_codes ( code, name )
      )
    `)
    .eq("draw_id", id);

  const lender = draw.contacts as { id: string; name: string } | null;

  type RawInvoice = {
    id: string;
    vendor: string | null;
    invoice_number: string | null;
    amount: number | null;
    file_path: string | null;
    file_name: string | null;
    projects: { id: string; name: string; address: string | null } | null;
    cost_codes: { code: string; name: string } | null;
  };

  const invoiceRows: RawInvoice[] = (drawInvoices ?? [])
    .map((di) => di.invoices as RawInvoice | null)
    .filter(Boolean) as RawInvoice[];

  // Look up active loans for each project
  const projectIds = [...new Set(invoiceRows.map((r) => r.projects?.id).filter(Boolean) as string[])];
  const loanByProject = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: loanRows } = await supabase
      .from("loans")
      .select("project_id, loan_number, created_at")
      .in("project_id", projectIds)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    for (const l of loanRows ?? []) {
      if (!loanByProject.has(l.project_id)) loanByProject.set(l.project_id, l.loan_number);
    }
  }

  // Fetch line items for all invoices
  const invoiceIds = invoiceRows.map((r) => r.id);
  const lineItemsByInvoice = new Map<string, { category: string; amount: number }[]>();
  if (invoiceIds.length > 0) {
    const { data: lineItems } = await supabase
      .from("invoice_line_items")
      .select(`invoice_id, amount, cost_codes ( name )`)
      .in("invoice_id", invoiceIds);
    for (const li of lineItems ?? []) {
      const cc = li.cost_codes as { name: string } | null;
      const entry = { category: cc?.name ?? "Uncategorized", amount: li.amount ?? 0 };
      if (!lineItemsByInvoice.has(li.invoice_id)) lineItemsByInvoice.set(li.invoice_id, []);
      lineItemsByInvoice.get(li.invoice_id)!.push(entry);
    }
  }

  // Build flat print rows in draw order
  const printRows: PrintRow[] = [];
  for (const inv of invoiceRows) {
    const proj = inv.projects;
    const project = proj?.name ?? "\u2014";
    const loanNumber = proj?.id ? (loanByProject.get(proj.id) ?? "\u2014") : "\u2014";
    const vendor = inv.vendor ?? "\u2014";
    const invoiceNumber = inv.invoice_number ?? "\u2014";

    const lineItems = lineItemsByInvoice.get(inv.id) ?? [];
    if (lineItems.length > 0) {
      for (const li of lineItems) {
        printRows.push({ project, loanNumber, category: li.category, vendor, invoiceNumber, amount: li.amount });
      }
    } else {
      const category = inv.cost_codes?.name ?? "\u2014";
      printRows.push({ project, loanNumber, category, vendor, invoiceNumber, amount: inv.amount ?? 0 });
    }
  }

  // Sort by loan number, then group
  printRows.sort((a, b) => a.loanNumber.localeCompare(b.loanNumber));

  type LoanGroup = { loanNumber: string; rows: PrintRow[]; subtotal: number };
  const groupMap = new Map<string, LoanGroup>();
  for (const row of printRows) {
    if (!groupMap.has(row.loanNumber)) {
      groupMap.set(row.loanNumber, { loanNumber: row.loanNumber, rows: [], subtotal: 0 });
    }
    const g = groupMap.get(row.loanNumber)!;
    g.rows.push(row);
    g.subtotal += row.amount;
  }
  const loanGroups = Array.from(groupMap.values());
  const grandTotal = loanGroups.reduce((s, g) => s + g.subtotal, 0);

  const drawName = drawDisplayName(draw.draw_date);

  // Build the HTML content for the table
  const tableHtml = loanGroups.map((group, gi) => {
    const rows = group.rows.map((row, ri) => (
      <tr key={`${group.loanNumber}-${ri}`}>
        <td>{row.project}</td>
        <td>{row.loanNumber}</td>
        <td>{row.category}</td>
        <td>{row.vendor}</td>
        <td>{row.invoiceNumber}</td>
        <td style={{ textAlign: "right" }}>{fmt(row.amount)}</td>
      </tr>
    ));

    return (
      <React.Fragment key={group.loanNumber}>
        {rows}
        <tr style={{ fontWeight: 700, borderTop: "1.5px solid #cbd5e1", background: "#f8fafc" }}>
          <td colSpan={5}>TOTAL &mdash; Loan #{group.loanNumber}</td>
          <td style={{ textAlign: "right" }}>{fmt(group.subtotal)}</td>
        </tr>
        {gi < loanGroups.length - 1 && (
          <tr><td colSpan={6} style={{ border: "none", height: 16 }} /></tr>
        )}
      </React.Fragment>
    );
  });

  return (
    <DrawPrintClient
      drawId={id}
      drawName={drawName}
      drawDate={draw.draw_date}
      lenderName={lender?.name ?? "\u2014"}
      notes={draw.notes}
    >
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Loan #</th>
            <th>Category</th>
            <th>Vendor</th>
            <th>Inv. #</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>{tableHtml}</tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, fontSize: "11pt", borderTop: "2px solid #1e293b", paddingTop: 10 }}>
            <td colSpan={5}>Grand Total</td>
            <td style={{ textAlign: "right" }}>{fmt(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </DrawPrintClient>
  );
}
