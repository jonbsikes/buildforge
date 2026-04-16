import React from "react";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { DrawSummary } from "./draws-summary";
import { formatDrawDateShort } from "./draws-summary";
import { drawDisplayName } from "./draws";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

const ink = "#1E293B";
const faint = "#94A3B8";
const lineSoft = "#F1F5F9";
const line = "#E2E8F0";
const subtotalLine = "#CBD5E1";
const surface = "#F8FAFC";
const muted = "#64748B";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: ink,
    paddingTop: 40,
    paddingBottom: 40,
    paddingLeft: 43,
    paddingRight: 43,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: ink,
  },
  headerLogo: { height: 50, width: 50, objectFit: "contain", marginRight: 14 },
  headerText: { flex: 1, flexDirection: "column", justifyContent: "center" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", color: ink, marginBottom: 5 },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  meta: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: ink },

  // Table
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: line,
    paddingVertical: 4,
  },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: faint,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: lineSoft,
    paddingVertical: 4,
  },
  td: { fontSize: 8.5, color: ink },

  // Loan subtotal
  subtotalRow: {
    flexDirection: "row",
    backgroundColor: surface,
    borderTopWidth: 1.2,
    borderTopColor: subtotalLine,
    paddingVertical: 5,
  },
  subtotalText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: ink },

  // Group spacer
  groupSpacer: { height: 10 },

  // Grand total
  grandTotalRow: {
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: ink,
    paddingTop: 8,
    marginTop: 4,
  },
  grandTotalText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: ink },

  // Notes
  notes: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: line,
    borderRadius: 4,
    padding: 10,
  },
  notesLabel: {
    fontSize: 8,
    color: faint,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  notesText: { fontSize: 9.5, color: ink },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 43,
    right: 43,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: line,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: muted },

  right: { textAlign: "right" },
});

// Column widths (percent of table width) — mirrors HTML print layout.
// Left-side sum must equal `totalLabel` for the subtotal/grand-total label cell.
const COL = {
  project: "26%",
  loan: "10%",
  category: "20%",
  vendor: "18%",
  invoice: "12%",
  amount: "14%",
  totalLabel: "86%", // sum of project+loan+category+vendor+invoice
} as const;

export interface DrawSummaryDocumentProps {
  drawDate: string; // YYYY-MM-DD
  lenderName: string;
  notes: string | null;
  summary: DrawSummary;
  logo?: Buffer;
}

export function DrawSummaryDocument({
  drawDate,
  lenderName,
  notes,
  summary,
  logo,
}: DrawSummaryDocumentProps) {
  const dateShort = formatDrawDateShort(drawDate);
  const drawName = drawDisplayName(drawDate);

  return (
    <Document title="Construction Loan Draw Request" author="Prairie Sky, LLC">
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {logo ? <Image src={logo as unknown as string} style={styles.headerLogo} /> : null}
          <View style={styles.headerText}>
            <Text style={styles.title}>Construction Loan Draw Request</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>Customer: Prairie Sky, LLC</Text>
              <Text style={styles.meta}>Date: {dateShort}</Text>
            </View>
          </View>
        </View>

        {/* Column headers */}
        <View style={styles.tableHeader} fixed>
          <View style={{ width: COL.project }}><Text style={styles.th}>Project</Text></View>
          <View style={{ width: COL.loan }}><Text style={styles.th}>Loan #</Text></View>
          <View style={{ width: COL.category }}><Text style={styles.th}>Category</Text></View>
          <View style={{ width: COL.vendor }}><Text style={styles.th}>Vendor</Text></View>
          <View style={{ width: COL.invoice }}><Text style={styles.th}>Inv. #</Text></View>
          <View style={{ width: COL.amount }}><Text style={[styles.th, styles.right]}>Amount</Text></View>
        </View>

        {/* Groups */}
        {summary.groups.map((group, gi) => (
          <React.Fragment key={group.loanNumber}>
            {group.rows.map((row, ri) => (
              <View
                key={`${group.loanNumber}-${ri}`}
                style={styles.row}
                wrap={false}
              >
                <View style={{ width: COL.project }}><Text style={styles.td}>{row.project}</Text></View>
                <View style={{ width: COL.loan }}><Text style={styles.td}>{row.loanNumber}</Text></View>
                <View style={{ width: COL.category }}><Text style={styles.td}>{row.category}</Text></View>
                <View style={{ width: COL.vendor }}><Text style={styles.td}>{row.vendor}</Text></View>
                <View style={{ width: COL.invoice }}><Text style={styles.td}>{row.invoiceNumber}</Text></View>
                <View style={{ width: COL.amount }}><Text style={[styles.td, styles.right]}>{fmtMoney(row.amount)}</Text></View>
              </View>
            ))}
            <View style={styles.subtotalRow} wrap={false}>
              <View style={{ width: COL.totalLabel }}>
                <Text style={styles.subtotalText}>TOTAL — Loan #{group.loanNumber}</Text>
              </View>
              <View style={{ width: COL.amount }}>
                <Text style={[styles.subtotalText, styles.right]}>{fmtMoney(group.subtotal)}</Text>
              </View>
            </View>
            {gi < summary.groups.length - 1 ? <View style={styles.groupSpacer} /> : null}
          </React.Fragment>
        ))}

        {/* Grand total */}
        <View style={styles.grandTotalRow} wrap={false}>
          <View style={{ width: `calc(${COL.project} + ${COL.loan} + ${COL.category} + ${COL.vendor} + ${COL.invoice})` as unknown as string }}>
            <Text style={styles.grandTotalText}>Grand Total</Text>
          </View>
          <View style={{ width: COL.amount }}>
            <Text style={[styles.grandTotalText, styles.right]}>{fmtMoney(summary.grandTotal)}</Text>
          </View>
        </View>

        {/* Notes */}
        {notes ? (
          <View style={styles.notes} wrap={false}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{drawName} · {lenderName}</Text>
          <Text style={styles.footerText}>Generated {dateShort}</Text>
        </View>
      </Page>
    </Document>
  );
}
