import React from "react";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { drawDisplayName } from "@/lib/draws";
import { fetchDrawSummary, formatDrawDateShort } from "@/lib/draws-summary";
import DrawPrintClient from "@/components/draws/DrawPrintClient";


interface Props {
  params: Promise<{ id: string }>;
}

function fmt(n: number | null) {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
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

  const lender = draw.contacts as { id: string; name: string } | null;

  const { summary } = await fetchDrawSummary(supabase as unknown as import("@supabase/supabase-js").SupabaseClient, id);
  const { groups: loanGroups, grandTotal } = summary;

  const drawName = drawDisplayName(draw.draw_date);
  const drawDateShort = formatDrawDateShort(draw.draw_date);

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
      drawDate={drawDateShort}
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
