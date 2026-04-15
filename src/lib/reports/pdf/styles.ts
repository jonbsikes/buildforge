import { StyleSheet, Font } from "@react-pdf/renderer";

// Brand tokens — kept in sync with CLAUDE.md UI conventions
export const colors = {
  brand: "#4272EF",
  brandLight: "#EEF2FF",
  ink: "#1E293B",
  text: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  line: "#E2E8F0",
  lineSoft: "#F1F5F9",
  surface: "#F8F9FA",
  white: "#FFFFFF",
  green: "#047857",
  red: "#B91C1C",
  orange: "#B45309",
};

// Letter, narrow margins (0.5" = 36pt)
export const page = {
  size: "LETTER" as const,
  orientation: "portrait" as const,
  margin: 36,
  headerHeight: 72,
  footerHeight: 28,
};

// Canonical typographic scale — keep reports visually consistent
export const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: colors.ink,
    paddingTop: page.margin + page.headerHeight,
    paddingBottom: page.margin + page.footerHeight,
    paddingLeft: page.margin,
    paddingRight: page.margin,
  },

  // ── Header (fixed, every page) ───────────────────────────────────────────
  header: {
    position: "absolute",
    top: page.margin,
    left: page.margin,
    right: page.margin,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  logo: { height: 42, width: 42 * 3.2, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  headerTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: colors.ink },
  headerSubtitle: { fontSize: 9, color: colors.muted, marginTop: 3 },
  headerDivider: {
    position: "absolute",
    top: page.margin + page.headerHeight - 8,
    left: page.margin,
    right: page.margin,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.ink,
  },

  // ── Footer (fixed, every page) ───────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: page.margin,
    left: page.margin,
    right: page.margin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: colors.line,
  },
  footerText: { fontSize: 7.5, color: colors.muted },

  // ── Section headings ─────────────────────────────────────────────────────
  sectionHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: colors.brand,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 10,
  },
  subHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: colors.ink,
    marginBottom: 4,
    marginTop: 8,
  },

  // ── Tables ───────────────────────────────────────────────────────────────
  table: { width: "100%", marginTop: 2 },
  tr: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.lineSoft,
  },
  trZebra: { backgroundColor: colors.surface },
  th: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  thCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  td: { fontSize: 9, color: colors.text },
  tdStrong: { fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.ink },
  tdRight: { textAlign: "right" },
  tdNum: { fontSize: 9, color: colors.text, textAlign: "right" },
  tdNumStrong: { fontSize: 9, fontFamily: "Helvetica-Bold", color: colors.ink, textAlign: "right" },

  // Subtotal / total rows
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 2,
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderTopWidth: 1.5,
    borderTopColor: colors.ink,
    marginTop: 4,
  },

  // ── KPI grid ─────────────────────────────────────────────────────────────
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, marginHorizontal: -4 },
  kpiCard: {
    width: "25%",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  kpiCardInner: {
    borderWidth: 0.5,
    borderColor: colors.line,
    borderRadius: 4,
    padding: 8,
    backgroundColor: colors.surface,
  },
  kpiLabel: { fontSize: 7.5, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: colors.ink, marginTop: 2 },

  // ── Callouts ─────────────────────────────────────────────────────────────
  calloutGreen: { color: colors.green, fontFamily: "Helvetica-Bold" },
  calloutRed: { color: colors.red, fontFamily: "Helvetica-Bold" },
  calloutOrange: { color: colors.orange, fontFamily: "Helvetica-Bold" },

  // Utility
  row: { flexDirection: "row" },
  grow: { flexGrow: 1 },
  mt4: { marginTop: 4 },
  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  muted: { color: colors.muted },
  small: { fontSize: 8 },
  tiny: { fontSize: 7 },
  bold: { fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  empty: { color: colors.faint, fontStyle: "italic", fontSize: 8.5, paddingVertical: 4 },
});

// Used in multi-col layouts — keep consistent
export const COMPANY_NAME = "Prairie Sky, LLC";
