"use client";

import { useEffect, type ReactNode } from "react";


interface Props {
  drawId: string;
  drawName: string;
  drawDate: string;
  lenderName: string;
  notes: string | null;
  children: ReactNode; // the summary table
}

export default function DrawPrintClient({
  drawId,
  drawName,
  drawDate,
  lenderName,
  notes,
  children,
}: Props) {
  // Hide sidebar and header when this page mounts, restore on unmount
  useEffect(() => {
    const sidebar = document.querySelector("[data-sidebar]") as HTMLElement | null;
    const shell = sidebar?.parentElement as HTMLElement | null;
    const body = document.body;

    if (sidebar) sidebar.style.display = "none";
    if (shell) shell.style.display = "block";
    body.style.background = "#fff";

    return () => {
      if (sidebar) sidebar.style.display = "";
      if (shell) shell.style.display = "";
      body.style.background = "";
    };
  }, []);

  return (
    <div className="print-page">
      <style>{`
        /* Hide app chrome for print page */
        [data-sidebar], [data-header] { display: none !important; }
        body { background: #fff !important; margin: 0; }

        .print-page {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 11pt;
          color: #1e293b;
          background: #fff;
          padding: 32px 40px;
          max-width: 900px;
          margin: 0 auto;
        }

        /* Print button */
        .print-page .print-btn { margin-bottom: 24px; display: flex; gap: 10px; }
        .print-page .print-btn button,
        .print-page .print-btn a {
          padding: 8px 18px;
          background: #4272EF;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          font-weight: 500;
          text-decoration: none;
          display: inline-block;
        }
        .print-page .print-btn a.secondary {
          background: #fff;
          color: #4272EF;
          border: 1.5px solid #4272EF;
        }

        /* Document header */
        .print-page .doc-header {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 22px;
          padding-bottom: 14px;
          border-bottom: 2px solid #1e293b;
        }
        .print-page .doc-header-logo {
          height: 90px;
          width: auto;
          object-fit: contain;
          flex-shrink: 0;
        }
        .print-page .doc-header-text {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 8px;
          flex: 1;
        }
        .print-page .doc-title {
          font-size: 17pt;
          font-weight: 700;
          line-height: 1.1;
        }
        .print-page .doc-header-meta {
          display: flex;
          justify-content: space-between;
          font-size: 10.5pt;
          font-weight: 500;
        }

        /* Table */
        .print-page table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        .print-page th {
          text-align: left;
          font-size: 8.5pt;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: #94a3b8;
          padding: 6px 8px;
          border-bottom: 2px solid #e2e8f0;
        }
        .print-page td {
          padding: 7px 8px;
          font-size: 10pt;
          border-bottom: 1px solid #f1f5f9;
        }
        .print-page tfoot td {
          font-weight: 700;
          font-size: 11pt;
          border-top: 2px solid #1e293b;
          border-bottom: none;
          padding-top: 10px;
        }

        /* Footer */
        .print-page .doc-footer {
          margin-top: 40px;
          padding-top: 12px;
          border-top: 1px solid #e2e8f0;
          font-size: 9pt;
          color: #94a3b8;
          display: flex;
          justify-content: space-between;
        }

        @page {
          size: letter portrait;
          margin: 0.55in 0.6in;
        }

        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .print-page {
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            font-size: 9.5pt !important;
          }
          .print-page .print-btn { display: none !important; }
          .print-page .doc-header-logo { height: 70px !important; }
          .print-page .doc-title { font-size: 14pt !important; }
          .print-page .doc-header-meta { font-size: 9.5pt !important; }
          .print-page th { font-size: 7.5pt !important; padding: 4px 6px !important; }
          .print-page td { font-size: 8.5pt !important; padding: 4px 6px !important; }
          .print-page tfoot td { font-size: 9.5pt !important; }
          /* Keep table rows together where possible */
          .print-page tr { page-break-inside: avoid; }
          /* Footer at bottom */
          .print-page .doc-footer { margin-top: 20px !important; }
        }
      `}</style>

      <div className="print-btn">
        <button onClick={() => window.print()}>Print Summary</button>
        <a href={`/api/draws/${drawId}/pdf`} download>
          Download PDF with Invoices
        </a>
      </div>

      {/* Header: large logo + stacked title / customer+date */}
      <div className="doc-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/prairie-sky-logo.png"
          alt="Prairie Sky"
          className="doc-header-logo"
        />
        <div className="doc-header-text">
          <div className="doc-title">Construction Loan Draw Request</div>
          <div className="doc-header-meta">
            <span>Customer: Prairie Sky, LLC</span>
            <span>Date: {drawDate}</span>
          </div>
        </div>
      </div>

      {children}

      {notes && (
        <div style={{ marginTop: 24, padding: "12px 16px", border: "1px solid #e2e8f0", borderRadius: 6 }}>
          <p style={{ fontSize: "9pt", textTransform: "uppercase", letterSpacing: ".05em", color: "#94a3b8", marginBottom: 6 }}>Notes</p>
          <