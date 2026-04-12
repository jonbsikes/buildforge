"use client";

interface Props {
  drawId: string;
  vendorCount: number;
  lenderName: string;
}

export default function RemittanceActions({
  drawId,
  vendorCount,
  lenderName,
}: Props) {
  return (
    <div
      className="no-print"
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "center",
        marginBottom: "24px",
        flexWrap: "wrap",
      }}
    >
      {/* Browser print — one page per vendor via CSS @page */}
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
        Print All Remittances ({vendorCount})
      </button>

      {/* PDF download — one page per vendor, saves as file */}
      <a
        href={`/api/draws/${drawId}/remittances-pdf`}
        download
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
        Download PDF
      </a>

      <a
        href={`/draws/${drawId}`}
        style={{
          padding: "8px 18px",
          background: "#fff",
          color: "#64748b",
          border: "1.5px solid #e2e8f0",
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