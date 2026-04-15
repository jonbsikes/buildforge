/** Shared types and slug registry for the report PDF system. */

export type ReportSlug =
  // Financial
  | "financial-summary"
  | "income-statement"
  | "balance-sheet"
  | "cash-flow"
  | "ap-aging"
  | "wip"
  | "vendor-spend"
  | "tax-export"
  // Project
  | "stage-progress"
  | "field-logs"
  | "job-cost"
  | "budget-variance"
  | "selections"
  | "gantt"
  | "subdivision-overview";

export interface ReportParams {
  start?: string;        // ISO date, inclusive
  end?: string;          // ISO date, inclusive
  asOf?: string;         // ISO date (balance sheet, WIP, etc.)
  projectId?: string;    // per-project reports
  subdivisionId?: string;
  year?: string;         // tax export
}

export interface ReportDescriptor {
  slug: ReportSlug;
  title: string;
  filename: (p: ReportParams) => string;
  /** Range, point-in-time, or per-project */
  kind: "range" | "asOf" | "project" | "range-or-project";
  orientation?: "portrait" | "landscape";
}

/**
 * Display mapping — keep this in sync with the registry below.
 * The actual data fn + PDF component are wired up in `src/lib/reports/registry.tsx`.
 */
export const REPORTS: Record<ReportSlug, ReportDescriptor> = {
  "financial-summary": {
    slug: "financial-summary",
    title: "Financial Summary",
    kind: "range",
    filename: (p) => `Financial-Summary-${p.end ?? ""}.pdf`,
  },
  "income-statement": {
    slug: "income-statement",
    title: "Income Statement",
    kind: "range",
    filename: (p) => `Income-Statement-${p.start}-to-${p.end}.pdf`,
  },
  "balance-sheet": {
    slug: "balance-sheet",
    title: "Balance Sheet",
    kind: "asOf",
    filename: (p) => `Balance-Sheet-${p.asOf}.pdf`,
  },
  "cash-flow": {
    slug: "cash-flow",
    title: "Cash Flow Statement",
    kind: "range",
    filename: (p) => `Cash-Flow-${p.start}-to-${p.end}.pdf`,
  },
  "ap-aging": {
    slug: "ap-aging",
    title: "AP Aging",
    kind: "asOf",
    filename: (p) => `AP-Aging-${p.asOf}.pdf`,
  },
  "wip": {
    slug: "wip",
    title: "Work in Progress Report",
    kind: "asOf",
    filename: (p) => `WIP-Report-${p.asOf}.pdf`,
  },
  "vendor-spend": {
    slug: "vendor-spend",
    title: "Vendor Spend",
    kind: "range",
    filename: (p) => `Vendor-Spend-${p.start}-to-${p.end}.pdf`,
  },
  "tax-export": {
    slug: "tax-export",
    title: "Tax Package",
    kind: "range",
    filename: (p) => `Tax-Package-${p.year ?? p.end}.pdf`,
  },
  "stage-progress": {
    slug: "stage-progress",
    title: "Stage Progress Report",
    kind: "project",
    filename: (p) => `Stage-Progress-${p.projectId}.pdf`,
  },
  "field-logs": {
    slug: "field-logs",
    title: "Field Logs Report",
    kind: "range-or-project",
    filename: (p) => `Field-Logs-${p.projectId ?? "all"}-${p.start ?? ""}-${p.end ?? ""}.pdf`,
  },
  "job-cost": {
    slug: "job-cost",
    title: "Job Cost Report",
    kind: "project",
    filename: (p) => `Job-Cost-${p.projectId}.pdf`,
  },
  "budget-variance": {
    slug: "budget-variance",
    title: "Budget Variance Report",
    kind: "project",
    filename: (p) => `Budget-Variance-${p.projectId}.pdf`,
  },
  "selections": {
    slug: "selections",
    title: "Selections Status Report",
    kind: "project",
    filename: (p) => `Selections-${p.projectId}.pdf`,
  },
  "gantt": {
    slug: "gantt",
    title: "Gantt Schedule",
    kind: "project",
    orientation: "landscape",
    filename: (p) => `Gantt-${p.projectId}.pdf`,
  },
  "subdivision-overview": {
    slug: "subdivision-overview",
    title: "Subdivision Overview",
    kind: "project",
    filename: (p) => `Subdivision-${p.subdivisionId ?? p.projectId}.pdf`,
  },
};
