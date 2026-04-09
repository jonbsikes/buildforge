// @ts-nocheck
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

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}/${y}`;
}

export default async function RemittancesPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: draw } = await supabase
    .from("loan_draws")
    .select("id, draw_number, draw_date, status, notes, contacts(id, name)")
    .eq("id", id)
    .single();

  if (!draw) notFound();
  if (draw.status !== "funded" && draw.status !== "paid") {
    return (
      <div className="p-8 text-center text-gray-500">
        Remittances are only available after a draw is funded.
      </div>
    );
  }

  const { data: vendorPayments } = await supabase
    .from("vendor_payments")
    .select("id, vendor_name, amount, check_number, payment_date, status")
    .eq("draw_id", id)
    .order("vendor_name");

  if (!vendorPayments || vendorPayments.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No vendor payment records found for this draw.
      </div>
    );
  }

  const vpIds = vendorPayments.map((vp) => vp.id);

  const { data: links } = await supabase
    .from("vendor_payment_invoices")
    .select(`
      vendor_payment_id,
      invoices (
        id, invoice_number, invoice_date, amount,
        cost_codes ( name ),
        projects ( name, address )
      )
    `)
    .in("vendor_payment_id", vpIds);

  // Group invoice links by vendor_payment_id
  const invoicesByVp = new Map<string, any[]>();
  for (const link of links ?? []) {
    const inv = link.invoices;
    if (!inv) continue;
    if (!invoicesByVp.has(link.vendor_payment_id)) {
      invoicesByVp.set(link.vendor_payment_id, []);
    }
    invoicesByVp.get(link.vendor_payment_id)!.push(inv);
  }

  const lender = draw.contacts as { id: string; name: string } | null;
  const drawName = drawDisplayName(draw.draw_date);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .no-print { margin-bottom: 24px; }
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-after: always; }
        }
        @page {
          size: letter portrait;
          margin: 0.65in 0.75in;
        }
        .remittance-page {
          max-width: 7in;
          margin: 0 auto;
          padding: 40px 48px;
        }
        .remittance-page + .remittance-page {
          margin-top: 0;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding-bottom: 14px;
          border-bottom: 2.5px solid #1e293b;
          margin-bottom: 20px;
        }
        .header img { height: 70px; width: auto; object-fit: contain; }
        .header-text { flex: 1; }
        .header-title { font-size: 16pt; font-weight: 700; color: #1e293b; }
        .header-sub { font-size: 10pt; color: #64748b; margin-top: 4px; }
        .section-label {
          font-size: 8.5pt;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: #94a3b8;
          margin-bottom: 4px;
        }
        .vendor-name { font-size: 14pt; font-weight: 700; color: #1e293b; margin-bottom: 12px; }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px 16px;
          margin-bottom: 20px;
        }
        .info-item p:first-child { font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin-bottom: 3px; }
        .info-item p:last-child { font-size: 11pt; font-weight: 600; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th {
          text-align: left;
          font-size: 8pt;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: #94a3b8;
          padding: 6px 8px;
          border-bottom: 2px solid #e2e8f0;
        }
        td { padding: 7px 8px; font-size: 10pt; border-bottom: 1px solid #f1f5f9; color: #334155; }
        tfoot td { font-weight: 700; border-top: 2px solid #1e293b; border-bottom: none; padding-top: 10px; font-size: 11pt; color: #1e293b; }
        .signature-block {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .sig-line {
          border-bottom: 1.5px solid #94a3b8;
          height: 36px;
          margin-bottom: 4px;
        }
        .sig-label { font-size: 8pt; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; }
        .footer {
          margin-top: 24px;
          padding-top: 10px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          font-size: 8pt;
          color: #94a3b8;
        }
      `}</style>

      <div style={{ padding: "24px 32px" }}>
        <div className="no-print" style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "24px" }}>
          <button
            onClick={() => window.print()}
            style={{
              padding: "8px 18px",
              background: "#4272EF",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "13px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Print All Remittances ({vendorPayments.length})
          </button>
          <a
            href={`/draws/${id}`}
            style={{
              padding: "8px 18px",
              background: "#fff",
              color: "#4272EF",
              border: "1.5px solid #4272EF",
              borderRadius: "6px",
              fontSize: "13px",
              cursor: "pointer",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            ← Back to Draw
          </a>
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            One page per vendor · {lender?.name ?? ""}
          </span>
        </div>

        {vendorPayments.map((vp, idx) => {
          const invoices = invoicesByVp.get(vp.id) ?? [];
          const invoiceTotal = invoices.reduce((s: number, inv: any) => s + (inv.amount ?? 0), 0);
          const isLast = idx === vendorPayments.length - 1;

          return (
            <div
              key={vp.id}
              className={`remittance-page${!isLast ? " page-break" : ""}`}
              style={{ borderTop: idx > 0 ? "none" : undefined }}
            >
              {/* Header */}
              <div className="header">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/prairie-sky-logo.png" alt="Prairie Sky" />
                <div className="header-text">
                  <div className="header-title">Check Remittance</div>
                  <div className="header-sub">{drawName} · {lender?.name ?? ""} · Prairie Sky, LLC</div>
                </div>
              </div>

              {/* Vendor info */}
              <div className="vendor-name">{vp.vendor_name}</div>

              <div className="info-grid">
                <div className="info-item">
                  <p>Check Number</p>
                  <p>{vp.check_number ? `#${vp.check_number}` : "—"}</p>
                </div>
                <div className="info-item">
                  <p>Payment Date</p>
                  <p>{fmtDate(vp.payment_date)}</p>
                </div>
                <div className="info-item">
                  <p>Check Amount</p>
                  <p>{fmt(vp.amount)}</p>
                </div>
                <div className="info-item">
                  <p>Status</p>
                  <p style={{ textTransform: "capitalize" }}>{vp.status}</p>
                </div>
                <div className="info-item">
                  <p>Draw Date</p>
                  <p>{fmtDate(draw.draw_date)}</p>
                </div>
                <div className="info-item">
                  <p>Lender</p>
                  <p>{lender?.name ?? "—"}</p>
                </div>
              </div>

              {/* Invoice detail table */}
              {invoices.length > 0 && (
                <>
                  <p className="section-label" style={{ marginBottom: "8px" }}>Invoices Covered by This Check</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Project / Address</th>
                        <th>Invoice #</th>
                        <th>Date</th>
                        <th>Category</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv: any) => (
                        <tr key={inv.id}>
                          <td>{inv.projects?.address ?? inv.projects?.name ?? "—"}</td>
                          <td>{inv.invoice_number ?? "—"}</td>
                          <td>{fmtDate(inv.invoice_date)}</td>
                          <td>{inv.cost_codes?.name ?? "—"}</td>
                          <td style={{ textAlign: "right" }}>{fmt(inv.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>Total</td>
                        <td style={{ textAlign: "right" }}>{fmt(invoiceTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}

              {/* Signature block */}
              <div className="signature-block">
                <div>
                  <div className="sig-line" />
                  <div className="sig-label">Authorized Signature</div>
                </div>
                <div>
                  <div className="sig-line" />
                  <div className="sig-label">Date</div>
                </div>
              </div>

              {/* Footer */}
              <div className="footer">
                <span>{vp.vendor_name} · {drawName}</span>
                <span>Generated {fmtDate(new Date().toISOString().split("T")[0])}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
