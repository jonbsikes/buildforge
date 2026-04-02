import React from "react";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { drawDisplayName } from "@/lib/draws";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

interface PrintRow {
  address: string;
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
        id, vendor, invoice_number, amount,
        projects ( id, name, address ),
        cost_codes ( code, name )
      )
    `)
    .eq("draw_id", id);

  const lender = draw.contacts as { id: string; name: string } | null;

  // Extract typed invoice rows
  type RawInvoice = {
    id: string;
    vendor: string | null;
    invoice_number: string | null;
    amount: number | null;
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

  // Fetch line items for all invoices (keyed by invoice_id)
  const invoiceIds = invoiceRows.map((r) => r.id);
  const lineItemsByInvoice = new Map<string, { category: string; amount: number }[]>();
  if (invoiceIds.length > 0) {
    const { data: lineItems } = await supabase
      .from("invoice_line_items")
      .select(`invoice_id, amount, cost_codes ( name )`)
      .in("invoice_id", invoiceIds);
    for (const li of lineItems ?? []) {
      const cc = li.cost_codes as { name: string } | null;
      const entry = {
        category: cc?.name ?? "Uncategorized",
        amount: li.amount ?? 0,
      };
      if (!lineItemsByInvoice.has(li.invoice_id)) {
        lineItemsByInvoice.set(li.invoice_id, []);
      }
      lineItemsByInvoice.get(li.invoice_id)!.push(entry);
    }
  }

  // Build flat print rows — one per line item (or one per invoice if no line items)
  const printRows: PrintRow[] = [];
  for (const inv of invoiceRows) {
    const proj = inv.projects;
    const address = proj?.address ?? proj?.name ?? "—";
    const loanNumber = proj?.id ? (loanByProject.get(proj.id) ?? "—") : "—";
    const vendor = inv.vendor ?? "—";
    const invoiceNumber = inv.invoice_number ?? "—";

    const lineItems = lineItemsByInvoice.get(inv.id) ?? [];
    if (lineItems.length > 0) {
      for (const li of lineItems) {
        printRows.push({ address, loanNumber, category: li.category, vendor, invoiceNumber, amount: li.amount });
      }
    } else {
      const category = inv.cost_codes?.name ?? "—";
      printRows.push({ address, loanNumber, category, vendor, invoiceNumber, amount: inv.amount ?? 0 });
    }
  }

  // Sort by loan number, then group
  printRows.sort((a, b) => a.loanNumber.localeCompare(b.loanNumber));

  // Build loan groups
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

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{drawName} – BuildForge</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11pt; color: #1e293b; background: #fff; padding: 32px 40px; }
          .print-btn { margin-bottom: 20px; }
          .print-btn button { padding: 8px 16px; background: #4272EF; color: #fff; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; }
          .doc-title { font-size: 18pt; font-weight: 700; margin-bottom: 6px; }
          .doc-meta { display: flex; justify-content: space-between; font-size: 11pt; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1e293b; }
          .doc-meta span { font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
          th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; padding: 6px 8px; border-bottom: 2px solid #e2e8f0; }
          th.right { text-align: right; }
          td { padding: 7px 8px; font-size: 10pt; border-bottom: 1px solid #f1f5f9; }
          td.right { text-align: right; }
          tr.subtotal td { font-weight: 700; border-top: 1.5px solid #cbd5e1; border-bottom: none; background: #f8fafc; }
          tr.spacer td { border: none; height: 16px; }
          tfoot tr td { font-weight: 700; font-size: 11pt; border-top: 2px solid #1e293b; border-bottom: none; padding-top: 10px; }
          .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #94a3b8; display: flex; justify-content: space-between; }
          @media print {
            body { padding: 0; }
            .print-btn { display: none; }
          }
        `}</style>
      </head>
      <body>
        <div className="print-btn">
          <button id="print-btn">Print / Save as PDF</button>
        </div>

        <div className="doc-title">Construction Loan Draw Request</div>
        <div className="doc-meta">
          <span>Customer: Prairie Sky, LLC</span>
          <span>Date: {draw.draw_date}</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>Address</th>
              <th>Loan #</th>
              <th>Category</th>
              <th>Vendor</th>
              <th>Inv. #</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loanGroups.map((group, gi) => (
              <React.Fragment key={group.loanNumber}>
                {group.rows.map((row, ri) => (
                  <tr key={`${group.loanNumber}-${ri}`}>
                    <td>{row.address}</td>
                    <td>{row.loanNumber}</td>
                    <td>{row.category}</td>
                    <td>{row.vendor}</td>
                    <td>{row.invoiceNumber}</td>
                    <td className="right">{fmt(row.amount)}</td>
                  </tr>
                ))}
                <tr className="subtotal">
                  <td colSpan={5}>TOTAL — Loan #{group.loanNumber}</td>
                  <td className="right">{fmt(group.subtotal)}</td>
                </tr>
                {gi < loanGroups.length - 1 && (
                  <tr className="spacer">
                    <td colSpan={6} />
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>Grand Total</td>
              <td className="right">{fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>

        {draw.notes && (
          <div style={{ marginTop: 24, padding: "12px 16px", border: "1px solid #e2e8f0", borderRadius: 6 }}>
            <p style={{ fontSize: "9pt", textTransform: "uppercase", letterSpacing: ".05em", color: "#94a3b8", marginBottom: 6 }}>Notes</p>
            <p>{draw.notes}</p>
          </div>
        )}

        <div className="footer">
          <span>{drawName} · {lender?.name ?? "—"}</span>
          <span>Generated {draw.draw_date}</span>
        </div>

        <script dangerouslySetInnerHTML={{
          __html: `document.getElementById('print-btn').addEventListener('click', function() { window.print(); });`
        }} />
      </body>
    </html>
  );
}
