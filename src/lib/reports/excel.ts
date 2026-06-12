/**
 * Excel (.xlsx) export for every registry report — SERVER ONLY.
 *
 * Imported exclusively from API route handlers (Node runtime) so exceljs never
 * enters a client bundle. Each builder consumes the SAME data object the PDF
 * renders (via getReportData in registry.tsx), so PDF, screen, and Excel always
 * show identical numbers.
 */
import ExcelJS from "exceljs";
import { COMPANY_NAME } from "./pdf/styles";
import { REPORTS, type ReportSlug, type ReportParams } from "./types";
import { getReportData } from "./registry";

import type { IncomeStatementData } from "./reports/incomeStatement";
import type { BalanceSheetData } from "./reports/balanceSheet";
import type { CashFlowData } from "./reports/cashFlow";
import type { FinancialSummaryData } from "./reports/financialSummary";
import type { APAgingData } from "./reports/apAging";
import type { WIPReportData } from "./reports/wip";
import type { VendorSpendData } from "./reports/vendorSpend";
import type { TaxExportData } from "./reports/taxExport";
import type { StageProgressData } from "./reports/stageProgress";
import type { FieldLogsData } from "./reports/fieldLogs";
import type { JobCostData } from "./reports/jobCost";
import type { BudgetVarianceData } from "./reports/budgetVariance";
import type { SelectionsData } from "./reports/selections";
import type { GanttData } from "./reports/gantt";
import type { SubdivisionOverviewData } from "./reports/subdivisionOverview";

// ─── Shared formatting ────────────────────────────────────────────────────────

export const MONEY_FMT = '"$"#,##0.00;("$"#,##0.00)';
const DATE_FMT = "mm/dd/yyyy";
const BRAND_ARGB = "FF4272EF";
const INK_ARGB = "FF1E293B";
const MUTED_ARGB = "FF64748B";

type WS = ExcelJS.Worksheet;

function excelDate(iso: string | null | undefined): Date | string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmtRangeSubtitle(p: ReportParams): string {
  if (p.asOf) return `As of ${p.asOf}`;
  if (p.start && p.end) return `For ${p.start} to ${p.end}`;
  return "";
}

/** Company name + report title + subtitle header block. */
function addHeader(ws: WS, title: string, subtitle?: string) {
  const r1 = ws.addRow([COMPANY_NAME]);
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: INK_ARGB } };
  const r2 = ws.addRow([title]);
  r2.getCell(1).font = { bold: true, size: 12, color: { argb: BRAND_ARGB } };
  if (subtitle) {
    const r3 = ws.addRow([subtitle]);
    r3.getCell(1).font = { italic: true, size: 10, color: { argb: MUTED_ARGB } };
  }
  ws.addRow([]);
}

function addSectionTitle(ws: WS, label: string) {
  const row = ws.addRow([label.toUpperCase()]);
  row.getCell(1).font = { bold: true, size: 10, color: { argb: BRAND_ARGB } };
}

interface Col {
  header: string;
  width?: number;
  money?: boolean;
  date?: boolean;
  align?: "left" | "right" | "center";
}

/** Bold column header row + per-column widths/formats. Returns column metadata. */
function addColumnHeader(ws: WS, cols: Col[]) {
  const row = ws.addRow(cols.map((c) => c.header));
  row.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 9, color: { argb: MUTED_ARGB } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
    const col = cols[colNumber - 1];
    if (col?.money || col?.align === "right") cell.alignment = { horizontal: "right" };
  });
  cols.forEach((c, i) => {
    const wsCol = ws.getColumn(i + 1);
    if (c.width && (!wsCol.width || wsCol.width < c.width)) wsCol.width = c.width;
  });
}

function addDataRow(ws: WS, cols: Col[], values: (string | number | Date | null | undefined)[], opts?: { bold?: boolean; indent?: number }) {
  const row = ws.addRow(values.map((v) => (v == null ? "" : v)));
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const col = cols[colNumber - 1];
    if (!col) return;
    if (col.money) {
      cell.numFmt = MONEY_FMT;
      cell.alignment = { horizontal: "right" };
    }
    if (col.date) cell.numFmt = DATE_FMT;
    if (col.align === "right" && !col.money) cell.alignment = { horizontal: "right" };
    if (opts?.bold) cell.font = { bold: true };
  });
  if (opts?.indent) {
    row.getCell(1).alignment = { ...(row.getCell(1).alignment ?? {}), indent: opts.indent };
  }
  return row;
}

function addTotalRow(ws: WS, cols: Col[], values: (string | number | null | undefined)[]) {
  const row = addDataRow(ws, cols, values, { bold: true });
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: { style: "medium", color: { argb: INK_ARGB } } };
  });
  return row;
}

/** Simple label/amount line (for statement-style sheets). */
function addLine(ws: WS, label: string, amount: number | null, opts?: { bold?: boolean; indent?: number; topBorder?: boolean }) {
  const row = ws.addRow([label, amount == null ? "" : amount]);
  row.getCell(2).numFmt = MONEY_FMT;
  row.getCell(2).alignment = { horizontal: "right" };
  if (opts?.bold) {
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = { bold: true };
  }
  if (opts?.indent) row.getCell(1).alignment = { indent: opts.indent };
  if (opts?.topBorder) {
    row.getCell(1).border = { top: { style: "medium", color: { argb: INK_ARGB } } };
    row.getCell(2).border = { top: { style: "medium", color: { argb: INK_ARGB } } };
  }
  return row;
}

function statementSheet(wb: ExcelJS.Workbook, name: string): WS {
  const ws = wb.addWorksheet(name);
  ws.getColumn(1).width = 52;
  ws.getColumn(2).width = 18;
  return ws;
}

/** Freeze everything above the column-header row and add an Excel autofilter to it. */
function freezeAndFilter(ws: WS, headerRowNumber: number, colCount: number) {
  ws.views = [{ state: "frozen", ySplit: headerRowNumber }];
  ws.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: colCount },
  };
}

// ─── Per-report builders ──────────────────────────────────────────────────────

function buildIncomeStatement(wb: ExcelJS.Workbook, data: IncomeStatementData, p: ReportParams) {
  const ws = statementSheet(wb, "Income Statement");
  addHeader(ws, "Income Statement", fmtRangeSubtitle(p));

  addSectionTitle(ws, "Revenue");
  for (const l of data.revenue) addLine(ws, l.account, l.total, { indent: 1 });
  addLine(ws, "Total Revenue", data.totalRevenue, { bold: true, topBorder: true });
  ws.addRow([]);

  addSectionTitle(ws, "Cost of Goods Sold");
  for (const l of data.cogs) addLine(ws, l.account, l.total, { indent: 1 });
  addLine(ws, "Total COGS", data.totalCOGS, { bold: true, topBorder: true });
  addLine(ws, "Gross Profit", data.grossProfit, { bold: true });
  ws.addRow([]);

  addSectionTitle(ws, "Operating Expenses");
  for (const l of data.expenses) addLine(ws, l.account, l.total, { indent: 1 });
  addLine(ws, "Total Operating Expenses", data.totalExpenses, { bold: true, topBorder: true });
  ws.addRow([]);
  addLine(ws, "Net Income", data.netIncome, { bold: true, topBorder: true });
}

function buildBalanceSheet(wb: ExcelJS.Workbook, data: BalanceSheetData, p: ReportParams) {
  const ws = statementSheet(wb, "Balance Sheet");
  addHeader(ws, "Balance Sheet", fmtRangeSubtitle(p));

  const acctRows = (rows: BalanceSheetData["currentAssets"]) => {
    for (const a of rows) {
      addLine(ws, a.account_number.endsWith("-CR") ? a.name : `${a.account_number} · ${a.name}`, a.balance, { indent: 1 });
      for (const pb of a.projectBreakdown ?? []) {
        addLine(ws, pb.project_name, pb.balance, { indent: 3 });
      }
    }
  };

  addSectionTitle(ws, "Assets");
  if (data.currentAssets.length) {
    addLine(ws, "Current Assets", null, { bold: true });
    acctRows(data.currentAssets);
  }
  if (data.inventoryAssets.length) {
    addLine(ws, "Construction Inventory (WIP & Land)", null, { bold: true });
    acctRows(data.inventoryAssets);
  }
  if (data.otherAssets.length) {
    addLine(ws, "Property & Equipment", null, { bold: true });
    acctRows(data.otherAssets);
  }
  addLine(ws, "Total Assets", data.totalAssets, { bold: true, topBorder: true });
  ws.addRow([]);

  addSectionTitle(ws, "Liabilities");
  if (data.currentLiabilities.length) {
    addLine(ws, "Current Liabilities", null, { bold: true });
    acctRows(data.currentLiabilities);
  }
  if (data.loanLiabilities.length) {
    addLine(ws, "Construction & Development Loans", null, { bold: true });
    acctRows(data.loanLiabilities);
  }
  addLine(ws, "Total Liabilities", data.totalLiabilities, { bold: true, topBorder: true });
  ws.addRow([]);

  addSectionTitle(ws, "Equity");
  acctRows(data.equityAccounts);
  if (Math.abs(data.retainedEarnings) > 0.004) {
    addLine(ws, "Retained Earnings (Net Income to Date)", data.retainedEarnings, { indent: 1 });
  }
  addLine(ws, "Total Equity", data.totalEquity, { bold: true, topBorder: true });
  ws.addRow([]);
  addLine(ws, "Total Liabilities + Equity", data.totalLiabilities + data.totalEquity, { bold: true, topBorder: true });
}

function buildCashFlow(wb: ExcelJS.Workbook, data: CashFlowData, p: ReportParams) {
  const ws = statementSheet(wb, "Cash Flow");
  addHeader(ws, "Cash Flow Statement", fmtRangeSubtitle(p));

  for (const section of [data.operating, data.investing, data.financing]) {
    addSectionTitle(ws, section.title);
    if (section.lines.length === 0) {
      const r = ws.addRow([section.note ?? "No activity for this period."]);
      r.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_ARGB } };
    } else {
      for (const l of section.lines) {
        addLine(ws, l.label, l.isSubtraction ? -l.amount : l.amount, { indent: 1 });
      }
    }
    addLine(ws, `Net Cash from ${section.title}`, section.total, { bold: true, topBorder: true });
    ws.addRow([]);
  }

  addLine(ws, "Net Change in Cash", data.netChange, { bold: true, topBorder: true });
  ws.addRow([]);
  addSectionTitle(ws, "Cash Reconciliation");
  addLine(ws, "Cash at beginning of period", data.beginningCash, { indent: 1 });
  addLine(ws, "Net change in cash", data.netChange, { indent: 1 });
  addLine(ws, "Cash at end of period (ties to GL cash accounts)", data.endingCash, { bold: true, topBorder: true });
}

function buildFinancialSummary(wb: ExcelJS.Workbook, data: FinancialSummaryData, p: ReportParams) {
  const ws = statementSheet(wb, "Financial Summary");
  addHeader(ws, "Financial Summary", fmtRangeSubtitle(p));

  addSectionTitle(ws, "Key Figures");
  addLine(ws, "Revenue (Period)", data.periodRevenue, { indent: 1 });
  addLine(ws, "Net Income (Period)", data.periodNetIncome, { indent: 1 });
  addLine(ws, "Cash on Hand", data.cash, { indent: 1 });
  addLine(ws, "Total WIP / CIP", data.totalWIP, { indent: 1 });
  addLine(ws, "AP Outstanding", data.apOutstanding, { indent: 1 });
  addLine(ws, "Construction Loans", data.totalLoans, { indent: 1 });
  ws.addRow([]);

  addSectionTitle(ws, "Balance Sheet Summary (All-Time)");
  addLine(ws, "Total Assets", data.totalAssets, { indent: 1 });
  addLine(ws, "Total Liabilities", data.totalLiabilities, { indent: 1 });
  addLine(ws, "Total Equity", data.totalEquity, { indent: 1 });
  ws.addRow([]);

  if (data.projectRows.length) {
    addSectionTitle(ws, "WIP & Loan Balance by Project");
    const cols: Col[] = [
      { header: "Project", width: 40 },
      { header: "WIP / CIP Balance", width: 20, money: true },
      { header: "Loan Balance", width: 18, money: true },
    ];
    addColumnHeader(ws, cols);
    for (const r of data.projectRows) addDataRow(ws, cols, [r.name, r.wip_balance, r.loan_balance]);
    addTotalRow(ws, cols, [
      "Total",
      data.projectRows.reduce((s, r) => s + r.wip_balance, 0),
      data.projectRows.reduce((s, r) => s + r.loan_balance, 0),
    ]);
  }
}

function buildAPAging(wb: ExcelJS.Workbook, data: APAgingData, p: ReportParams) {
  const ws = wb.addWorksheet("AP Aging");
  addHeader(ws, "AP Aging", fmtRangeSubtitle(p));

  addSectionTitle(ws, "Approved Invoices in Accounts Payable — by Aging Bucket");
  const cols: Col[] = [
    { header: "Vendor", width: 30 },
    { header: "Invoice #", width: 16 },
    { header: "Project", width: 26 },
    { header: "Due Date", width: 12, date: true },
    { header: "Current", width: 13, money: true },
    { header: "1-30 Days", width: 13, money: true },
    { header: "31-60 Days", width: 13, money: true },
    { header: "61-90 Days", width: 13, money: true },
    { header: "90+ Days", width: 13, money: true },
    { header: "Total", width: 14, money: true },
  ];
  addColumnHeader(ws, cols);
  for (const r of data.rows) {
    addDataRow(ws, cols, [
      r.vendor,
      r.invoice_number,
      r.project,
      excelDate(r.due_date),
      r.bucket === "current" ? r.amount : null,
      r.bucket === "1-30" ? r.amount : null,
      r.bucket === "31-60" ? r.amount : null,
      r.bucket === "61-90" ? r.amount : null,
      r.bucket === "90+" ? r.amount : null,
      r.amount,
    ]);
  }
  addTotalRow(ws, cols, [
    "Total", "", "", "",
    data.current, data.days1to30, data.days31to60, data.days61to90, data.days90plus, data.grandTotal,
  ]);

  ws.addRow([]);
  addSectionTitle(ws, "Accounts Payable Reconciliation");
  const reconCols: Col[] = [{ header: "", width: 50 }, { header: "", width: 16, money: true }];
  addDataRow(ws, reconCols, ["Approved invoices outstanding (gross)", data.grandTotal]);
  if (data.creditsAvailable > 0.004) {
    addDataRow(ws, reconCols, ["Less: Vendor credits available", -data.creditsAvailable]);
  }
  addTotalRow(ws, reconCols, ["Net Accounts Payable (ties to GL account 2000)", data.netAP]);

  const memoCols: Col[] = [
    { header: "Vendor", width: 30 },
    { header: "Invoice #", width: 16 },
    { header: "Project", width: 26 },
    { header: "Date", width: 12, date: true },
    { header: "Amount", width: 14, money: true },
  ];
  if (data.pendingReview.length) {
    ws.addRow([]);
    addSectionTitle(ws, "Memo — Invoices Pending Review (not yet in AP)");
    addColumnHeader(ws, memoCols);
    for (const r of data.pendingReview) {
      addDataRow(ws, memoCols, [r.vendor, r.invoice_number, r.project, excelDate(r.date), r.amount]);
    }
    addTotalRow(ws, memoCols, ["Total Pending Review", "", "", "", data.pendingReviewTotal]);
  }
  if (data.outstandingChecks.length) {
    ws.addRow([]);
    addSectionTitle(ws, "Memo — Checks Issued, Not Yet Cleared (account 2050)");
    addColumnHeader(ws, memoCols);
    for (const r of data.outstandingChecks) {
      addDataRow(ws, memoCols, [r.vendor, r.invoice_number, r.project, excelDate(r.date), r.amount]);
    }
    addTotalRow(ws, memoCols, ["Total Checks Outstanding", "", "", "", data.outstandingChecksTotal]);
  }
}

function buildWip(wb: ExcelJS.Workbook, data: WIPReportData, p: ReportParams) {
  const ws = wb.addWorksheet("WIP Report");
  addHeader(ws, "Work in Progress Report", fmtRangeSubtitle(p));

  const cols: Col[] = [
    { header: "Project", width: 32 },
    { header: "Type", width: 10 },
    { header: "Budget", width: 16, money: true },
    { header: "Invoiced Costs", width: 16, money: true },
    { header: "Ledger WIP / CIP", width: 18, money: true },
    { header: "Cap. Interest", width: 14, money: true },
    { header: "% of Budget", width: 12, align: "right" },
  ];
  addColumnHeader(ws, cols);
  for (const r of data.rows) {
    addDataRow(ws, cols, [
      r.name,
      r.type,
      r.total_budget > 0 ? r.total_budget : null,
      r.costs_to_date,
      r.ledger_wip,
      r.capitalized_interest !== 0 ? r.capitalized_interest : null,
      r.pct_complete == null ? "" : `${r.pct_complete.toFixed(1)}%`,
    ]);
  }
  addTotalRow(ws, cols, [
    "Total", "",
    data.totalBudget > 0 ? data.totalBudget : null,
    data.totalCosts,
    data.totalLedgerWIP,
    data.totalCapInterest !== 0 ? data.totalCapInterest : null,
    "",
  ]);
  ws.addRow([]);
  const note = ws.addRow([
    "Ledger WIP / CIP is the net balance of GL accounts 1210, 1230 and 1220 per project from posted journal entries — the total ties to the Balance Sheet.",
  ]);
  note.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_ARGB } };
}

function buildVendorSpend(wb: ExcelJS.Workbook, data: VendorSpendData, p: ReportParams) {
  const ws = wb.addWorksheet("Vendor Spend");
  addHeader(ws, "Vendor Spend", fmtRangeSubtitle(p));
  addSectionTitle(ws, "Vendors by Total Spend (by invoice date)");

  const cols: Col[] = [
    { header: "Vendor", width: 36 },
    { header: "Trade", width: 22 },
    { header: "# Invoices", width: 12, align: "right" },
    { header: "Total Spend", width: 16, money: true },
  ];
  addColumnHeader(ws, cols);
  for (const v of data.vendors) addDataRow(ws, cols, [v.vendor, v.trade ?? "", v.invoiceCount, v.total]);
  addTotalRow(ws, cols, ["Grand Total", "", "", data.grandTotal]);
}

function buildTaxExport(wb: ExcelJS.Workbook, data: TaxExportData) {
  const yr = data.taxYear;
  const totalAssets = data.balanceSheetAssets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = data.balanceSheetLiabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity = data.balanceSheetEquity.reduce((s, a) => s + a.balance, 0);
  const total1099 = data.vendors1099.reduce((s, v) => s + v.total, 0);

  // ── Cover ──
  const cover = statementSheet(wb, "Cover");
  addHeader(cover, "Tax Package", `Tax year ${yr}`);
  addSectionTitle(cover, "Key Figures");
  addLine(cover, "Net Income (accrual)", data.incomeStatement.netIncome, { indent: 1 });
  addLine(cover, `Total Assets (12/31/${yr})`, totalAssets, { indent: 1 });
  addLine(cover, `Total Liabilities (12/31/${yr})`, totalLiabilities, { indent: 1 });
  addLine(cover, `Total Equity (12/31/${yr})`, totalEquity, { indent: 1 });
  addLine(cover, "1099-Reportable Payments (cash)", total1099, { indent: 1 });
  cover.addRow([]);
  addSectionTitle(cover, "Contents");
  const contents: [string, string][] = [
    ["Trial Balance", "every account: beginning balance, year debits/credits, ending balance"],
    ["Income Statement", `account-level P&L for ${yr} (accrual)`],
    ["Balance Sheet", `account balances as of Dec 31, ${yr}`],
    ["General Ledger", `every posted journal entry line in ${yr}`],
    ["1099 Vendors", `vendors paid $600+ in cleared checks during ${yr} (cash basis)`],
    ["Paid Invoices", `invoice register — checks cleared in ${yr} (cash basis)`],
    ["Loan Schedule", "per-loan balances, advances, paydowns + capitalized interest by project"],
    ["Project WIP", "beginning/ending WIP-CIP and year-end loan balance per project"],
  ];
  for (const [tab, desc] of contents) {
    const r = cover.addRow([`${tab} — ${desc}`]);
    r.getCell(1).font = { size: 9, color: { argb: MUTED_ARGB } };
  }
  cover.addRow([]);
  addSectionTitle(cover, "Notes for Preparer");
  const notes = [
    "Trial balance, income statement, balance sheet, and general ledger are accrual-basis from posted journal entries.",
    "1099 vendor totals and the paid-invoice register are cash-basis: checks that cleared the bank during the year.",
    'Trial balance: prior-year income statement activity is rolled into "Retained Earnings — prior years" so both balance columns foot to zero.',
    "All project-level construction loan interest is capitalized into WIP/CIP (ASC 835-20); see the Loan Schedule tab for the year's capitalized interest by project.",
  ];
  for (const n of notes) {
    const r = cover.addRow([n]);
    r.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_ARGB } };
    r.getCell(1).alignment = { wrapText: true };
  }

  // ── Trial Balance ──
  const tb = wb.addWorksheet("Trial Balance");
  addHeader(tb, "Trial Balance", `Tax year ${yr}`);
  const tbCols: Col[] = [
    { header: "Acct #", width: 9 },
    { header: "Account", width: 44 },
    { header: "Type", width: 11 },
    { header: `Balance 1/1/${yr}`, width: 17, money: true },
    { header: `${yr} Debits`, width: 16, money: true },
    { header: `${yr} Credits`, width: 16, money: true },
    { header: `Balance 12/31/${yr}`, width: 18, money: true },
  ];
  addColumnHeader(tb, tbCols);
  freezeAndFilter(tb, tb.rowCount, tbCols.length);
  for (const r of data.trialBalance) {
    addDataRow(tb, tbCols, [
      r.accountNumber, r.accountName, r.accountType,
      r.beginningBalance, r.yearDebits, r.yearCredits, r.endingBalance,
    ]);
  }
  addTotalRow(tb, tbCols, [
    "", "TOTAL (foots to zero)", "",
    data.trialBalance.reduce((s, r) => s + r.beginningBalance, 0),
    data.trialBalance.reduce((s, r) => s + r.yearDebits, 0),
    data.trialBalance.reduce((s, r) => s + r.yearCredits, 0),
    data.trialBalance.reduce((s, r) => s + r.endingBalance, 0),
  ]);
  tb.addRow([]);
  const tbNote = tb.addRow([
    "Balances are debit-positive (liabilities, equity, and revenue show negative). Beginning + Debits − Credits = Ending on every row.",
  ]);
  tbNote.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_ARGB } };

  // ── Income Statement (account level) ──
  const pl = statementSheet(wb, "Income Statement");
  addHeader(pl, "Income Statement", `Tax year ${yr} (accrual basis)`);
  addSectionTitle(pl, "Revenue");
  for (const l of data.pnlRevenue) addLine(pl, l.account, l.amount, { indent: 1 });
  addLine(pl, "Total Revenue", data.incomeStatement.revenue, { bold: true, topBorder: true });
  pl.addRow([]);
  addSectionTitle(pl, "Cost of Goods Sold");
  for (const l of data.pnlCogs) addLine(pl, l.account, l.amount, { indent: 1 });
  addLine(pl, "Total COGS", data.incomeStatement.cogs, { bold: true, topBorder: true });
  addLine(pl, "Gross Profit", data.incomeStatement.revenue - data.incomeStatement.cogs, { bold: true });
  pl.addRow([]);
  addSectionTitle(pl, "Operating Expenses");
  for (const l of data.pnlExpenses) addLine(pl, l.account, l.amount, { indent: 1 });
  addLine(pl, "Total Operating Expenses", data.incomeStatement.expenses, { bold: true, topBorder: true });
  pl.addRow([]);
  addLine(pl, "Net Income", data.incomeStatement.netIncome, { bold: true, topBorder: true });

  // ── Balance Sheet ──
  const bs = statementSheet(wb, "Balance Sheet");
  addHeader(bs, "Balance Sheet", `As of Dec 31, ${yr}`);
  addSectionTitle(bs, "Assets");
  for (const a of data.balanceSheetAssets) addLine(bs, a.account, a.balance, { indent: 1 });
  addLine(bs, "Total Assets", totalAssets, { bold: true, topBorder: true });
  bs.addRow([]);
  addSectionTitle(bs, "Liabilities");
  for (const a of data.balanceSheetLiabilities) addLine(bs, a.account, a.balance, { indent: 1 });
  addLine(bs, "Total Liabilities", totalLiabilities, { bold: true, topBorder: true });
  bs.addRow([]);
  addSectionTitle(bs, "Equity");
  for (const a of data.balanceSheetEquity) addLine(bs, a.account, a.balance, { indent: 1 });
  addLine(bs, "Total Equity", totalEquity, { bold: true, topBorder: true });
  bs.addRow([]);
  addLine(bs, "Total Liabilities + Equity", totalLiabilities + totalEquity, { bold: true, topBorder: true });

  // ── General Ledger ──
  const gl = wb.addWorksheet("General Ledger");
  addHeader(gl, "General Ledger", `All posted journal entry lines — ${yr}`);
  const glCols: Col[] = [
    { header: "Date", width: 11, date: true },
    { header: "Reference", width: 22 },
    { header: "Description", width: 48 },
    { header: "Acct #", width: 9 },
    { header: "Account", width: 30 },
    { header: "Project", width: 26 },
    { header: "Debit", width: 14, money: true },
    { header: "Credit", width: 14, money: true },
    { header: "Source", width: 18 },
  ];
  addColumnHeader(gl, glCols);
  freezeAndFilter(gl, gl.rowCount, glCols.length);
  let glDebits = 0, glCredits = 0;
  for (const l of data.glLines) {
    glDebits += l.debit ?? 0;
    glCredits += l.credit ?? 0;
    addDataRow(gl, glCols, [
      excelDate(l.date), l.reference, l.description, l.accountNumber, l.accountName,
      l.project, l.debit, l.credit, l.sourceType,
    ]);
  }
  addTotalRow(gl, glCols, ["", "", "TOTAL", "", "", "", glDebits, glCredits, ""]);

  // ── 1099 vendor totals (cash basis) ──
  const v = wb.addWorksheet("1099 Vendors");
  addHeader(v, "Vendors — 1099 Reportable ($600+)", `Cash paid in ${yr} (cleared checks)`);
  const vCols: Col[] = [
    { header: "Vendor", width: 40 },
    { header: `Cash Paid in ${yr}`, width: 20, money: true },
  ];
  addColumnHeader(v, vCols);
  for (const row of data.vendors1099) addDataRow(v, vCols, [row.vendor, row.total]);
  addTotalRow(v, vCols, ["Total 1099 Payments", total1099]);
  if (data.ownerFundedExcludedFrom1099 > 0.005) {
    v.addRow([]);
    const excl = v.addRow([
      `Excludes $${data.ownerFundedExcludedFrom1099.toLocaleString("en-US", { minimumFractionDigits: 2 })} of invoices paid personally by owners ` +
        "(recorded as capital contributions — the company paid no cash, so they are not 1099-reportable). See the Paid Invoices tab.",
    ]);
    excl.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_ARGB } };
    excl.getCell(1).alignment = { wrapText: true };
  }

  // ── Paid invoice register (cash basis) ──
  const inv = wb.addWorksheet("Paid Invoices");
  addHeader(inv, "Paid Invoices Register", `Invoices paid (cleared) in ${yr}`);
  const iCols: Col[] = [
    { header: "Invoice #", width: 18 },
    { header: "Vendor", width: 32 },
    { header: "Project", width: 28 },
    { header: "Paid Date", width: 12, date: true },
    { header: "Paid By", width: 24 },
    { header: "Amount", width: 14, money: true },
  ];
  addColumnHeader(inv, iCols);
  freezeAndFilter(inv, inv.rowCount, iCols.length);
  for (const row of data.paidInvoices) {
    addDataRow(inv, iCols, [
      row.invoiceNumber, row.vendor, row.project, excelDate(row.date),
      row.ownerFunded ? "Owner (capital contribution)" : "Company",
      row.amount,
    ]);
  }
  addTotalRow(inv, iCols, ["Total", "", "", "", "", data.paidInvoices.reduce((s, r) => s + r.amount, 0)]);

  // ── Loan schedule + capitalized interest ──
  const ls = wb.addWorksheet("Loan Schedule");
  addHeader(ls, "Loan Schedule", `Balances and activity — ${yr}`);
  const lsCols: Col[] = [
    { header: "Loan #", width: 12 },
    { header: "Lender", width: 24 },
    { header: "Project", width: 28 },
    { header: "Rate", width: 8, align: "right" },
    { header: "Status", width: 10 },
    { header: `Balance 1/1/${yr}`, width: 16, money: true },
    { header: "Advances", width: 15, money: true },
    { header: "Paydowns", width: 15, money: true },
    { header: `Balance 12/31/${yr}`, width: 17, money: true },
  ];
  addColumnHeader(ls, lsCols);
  for (const r of data.loanSchedule) {
    addDataRow(ls, lsCols, [
      r.loanNumber, r.lender, r.project,
      r.interestRate == null ? "" : `${r.interestRate}%`,
      r.status, r.beginningBalance, r.advances, r.paydowns, r.endingBalance,
    ]);
  }
  addTotalRow(ls, lsCols, [
    "TOTAL", "", "", "", "",
    data.loanSchedule.reduce((s, r) => s + r.beginningBalance, 0),
    data.loanSchedule.reduce((s, r) => s + r.advances, 0),
    data.loanSchedule.reduce((s, r) => s + r.paydowns, 0),
    data.loanSchedule.reduce((s, r) => s + r.endingBalance, 0),
  ]);
  ls.addRow([]);
  addSectionTitle(ls, `Capitalized Interest by Project — ${yr}`);
  const ciCols: Col[] = [
    { header: "Project", width: 36 },
    { header: "Invoiced (codes 121/122)", width: 24, money: true },
    { header: "Accrued (acct 1220)", width: 20, money: true },
    { header: "Total Capitalized", width: 18, money: true },
  ];
  addColumnHeader(ls, ciCols);
  for (const r of data.capInterest) addDataRow(ls, ciCols, [r.project, r.invoiced, r.accrued, r.total]);
  addTotalRow(ls, ciCols, [
    "TOTAL",
    data.capInterest.reduce((s, r) => s + r.invoiced, 0),
    data.capInterest.reduce((s, r) => s + r.accrued, 0),
    data.capInterest.reduce((s, r) => s + r.total, 0),
  ]);
  ls.addRow([]);
  const lsNote = ls.addRow([
    "Project-level construction loan interest is capitalized into WIP/CIP (ASC 835-20) — it does not appear on the income statement.",
  ]);
  lsNote.getCell(1).font = { italic: true, size: 9, color: { argb: MUTED_ARGB } };

  // ── Project WIP ──
  const pw = wb.addWorksheet("Project WIP");
  addHeader(pw, "Project WIP / CIP", `Beginning and ending balances — ${yr}`);
  const pwCols: Col[] = [
    { header: "Project", width: 32 },
    { header: `WIP-CIP 1/1/${yr}`, width: 17, money: true },
    { header: `WIP-CIP 12/31/${yr}`, width: 18, money: true },
    { header: `Loans 12/31/${yr}`, width: 17, money: true },
  ];
  addColumnHeader(pw, pwCols);
  for (const r of data.projectWip) {
    addDataRow(pw, pwCols, [r.project, r.beginningWip, r.endingWip, r.loanBalance]);
  }
  addTotalRow(pw, pwCols, [
    "TOTAL",
    data.projectWip.reduce((s, r) => s + r.beginningWip, 0),
    data.projectWip.reduce((s, r) => s + r.endingWip, 0),
    data.projectWip.reduce((s, r) => s + r.loanBalance, 0),
  ]);
}

function buildStageProgress(wb: ExcelJS.Workbook, data: StageProgressData) {
  const ws = wb.addWorksheet("Stage Progress");
  addHeader(ws, "Stage Progress Report", `${data.projectName} — ${data.projectAddress}`);

  const cols: Col[] = [
    { header: "#", width: 6, align: "right" },
    { header: "Stage", width: 38 },
    { header: "Status", width: 14 },
    { header: "Planned Start", width: 13, date: true },
    { header: "Planned End", width: 13, date: true },
    { header: "Actual Start", width: 13, date: true },
    { header: "Actual End", width: 13, date: true },
    { header: "Variance (days)", width: 14, align: "right" },
  ];

  const addStageRows = (label: string, stages: StageProgressData["stages"]) => {
    addSectionTitle(ws, label);
    addColumnHeader(ws, cols);
    for (const s of stages) {
      addDataRow(ws, cols, [
        s.stageNumber,
        s.stageName,
        s.status.replace(/_/g, " "),
        excelDate(s.plannedStart),
        excelDate(s.plannedEnd),
        excelDate(s.actualStart),
        excelDate(s.actualEnd),
        s.daysVariance == null ? "" : s.daysVariance,
      ]);
    }
    ws.addRow([]);
  };

  addStageRows("Exterior Track", data.exteriorStages);
  addStageRows("Interior Track", data.interiorStages);
}

function buildFieldLogs(wb: ExcelJS.Workbook, data: FieldLogsData, p: ReportParams) {
  const ws = wb.addWorksheet("Field Logs");
  addHeader(ws, "Field Logs Report", data.projectName ?? fmtRangeSubtitle(p));

  const cols: Col[] = [
    { header: "Date", width: 12, date: true },
    { header: "Project", width: 28 },
    { header: "Notes / To-Do", width: 70 },
    { header: "Status", width: 12 },
    { header: "Priority", width: 10 },
    { header: "Due", width: 12, date: true },
  ];
  addColumnHeader(ws, cols);
  for (const log of data.logs) {
    addDataRow(ws, cols, [excelDate(log.log_date), log.project_name, log.notes, "", "", ""], { bold: true });
    for (const t of log.todos) {
      addDataRow(ws, cols, ["", "", `• ${t.description}`, t.status, t.priority, excelDate(t.due_date)], { indent: 1 });
    }
  }
}

function buildJobCost(wb: ExcelJS.Workbook, data: JobCostData) {
  const ws = wb.addWorksheet("Job Cost");
  addHeader(ws, "Job Cost Report", data.subtitle);

  const cols: Col[] = [
    { header: "Code", width: 8 },
    { header: "Description", width: 34 },
    ...data.projects.map((pr) => ({ header: pr.name, width: 16, money: true })),
    { header: "Total", width: 16, money: true },
  ];
  addColumnHeader(ws, cols);
  for (const r of data.rows) {
    addDataRow(ws, cols, [
      r.code,
      r.name,
      ...data.projects.map((pr) => {
        const v = r.projectActuals[pr.id] ?? 0;
        return Math.abs(v) > 0.005 ? v : null;
      }),
      Math.abs(r.total) > 0.005 ? r.total : null,
    ]);
  }
  addTotalRow(ws, cols, [
    "", "TOTAL",
    ...data.projects.map((pr) => data.projectTotals[pr.id] ?? 0),
    data.grandTotal,
  ]);
}

function buildBudgetVariance(wb: ExcelJS.Workbook, data: BudgetVarianceData) {
  const ws = wb.addWorksheet("Budget Variance");
  addHeader(ws, "Budget Variance Report", `${data.projectName} — ${data.projectAddress}`);

  const cols: Col[] = [
    { header: "Code", width: 8 },
    { header: "Description", width: 38 },
    { header: "Budget", width: 15, money: true },
    { header: "Actual", width: 15, money: true },
    { header: "Variance", width: 15, money: true },
    { header: "% Used", width: 10, align: "right" },
  ];
  addColumnHeader(ws, cols);
  for (const r of data.rows) {
    addDataRow(ws, cols, [
      r.code,
      r.name,
      r.budget,
      r.actual,
      r.budget - r.actual,
      r.budget > 0 ? `${((r.actual / r.budget) * 100).toFixed(0)}%` : "",
    ]);
  }
  addTotalRow(ws, cols, ["", "TOTAL", data.totBudget, data.totActual, data.totBudget - data.totActual, ""]);
}

function buildSelections(wb: ExcelJS.Workbook, data: SelectionsData) {
  const ws = wb.addWorksheet("Selections");
  addHeader(ws, "Selections Status Report", `${data.projectName} — ${data.projectAddress}`);

  const cols: Col[] = [
    { header: "Category", width: 20 },
    { header: "Item", width: 36 },
    { header: "Status", width: 12 },
    { header: "Notes", width: 50 },
  ];
  addColumnHeader(ws, cols);
  for (const cat of Object.keys(data.byCategory).sort()) {
    for (const s of data.byCategory[cat]!) {
      addDataRow(ws, cols, [cat, s.item_name, s.status, s.notes ?? ""]);
    }
  }
}

function buildGantt(wb: ExcelJS.Workbook, data: GanttData) {
  const ws = wb.addWorksheet("Gantt Schedule");
  addHeader(ws, "Gantt Schedule", `${data.projectName} — ${data.projectAddress}`);

  const cols: Col[] = [
    { header: "#", width: 6, align: "right" },
    { header: "Stage", width: 40 },
    { header: "Start", width: 13, date: true },
    { header: "End", width: 13, date: true },
    { header: "Status", width: 14 },
  ];
  addColumnHeader(ws, cols);
  for (const s of data.stages) {
    addDataRow(ws, cols, [
      s.stage_number,
      s.stage_name,
      excelDate(s.actual_start_date || s.planned_start_date),
      excelDate(s.actual_end_date || s.planned_end_date),
      s.status.replace(/_/g, " "),
    ]);
  }
}

function buildSubdivisionOverview(wb: ExcelJS.Workbook, data: SubdivisionOverviewData) {
  const ws = wb.addWorksheet("Subdivision Overview");
  addHeader(ws, "Subdivision Overview", data.subdivisionName);

  addSectionTitle(ws, "Summary");
  const sumCols: Col[] = [{ header: "", width: 32 }, { header: "", width: 18, money: true }];
  addDataRow(ws, sumCols, ["Total Homes", data.totalHomes]);
  addDataRow(ws, sumCols, ["Under Construction", data.underConstruction]);
  addDataRow(ws, sumCols, ["Completed", data.completed]);
  addLine(ws, "Total Contract Value", data.totalContractValue);
  addLine(ws, "Total Spend to Date", data.totalSpend);
  ws.addRow([]);

  addSectionTitle(ws, "Homes");
  const cols: Col[] = [
    { header: "Home", width: 30 },
    { header: "Block", width: 8 },
    { header: "Lot", width: 8 },
    { header: "Plan", width: 16 },
    { header: "Status", width: 16 },
    { header: "% Complete", width: 12, align: "right" },
    { header: "Contract Price", width: 16, money: true },
  ];
  addColumnHeader(ws, cols);
  for (const h of data.homes) {
    addDataRow(ws, cols, [
      h.name,
      h.block ?? "",
      h.lot ?? "",
      h.plan ?? "",
      h.status.replace(/_/g, " "),
      `${h.pct_complete.toFixed(0)}%`,
      h.contract_price > 0 ? h.contract_price : null,
    ]);
  }
}

// ─── Draw request workbook ────────────────────────────────────────────────────

export interface DrawXlsxArgs {
  drawDate: string;
  lenderName: string;
  status: string;
  notes: string | null;
  summary: import("../draws-summary").DrawSummary;
}

/** Draw summary worksheet + invoice list — Excel twin of the draw PDF. */
export async function renderDrawXlsx(args: DrawXlsxArgs): Promise<{ buffer: Buffer; filename: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  wb.created = new Date();

  // Sheet 1 — grouped summary (mirrors the PDF layout)
  const ws = wb.addWorksheet("Draw Summary");
  addHeader(ws, "Construction Loan Draw Request", `${args.lenderName} — Draw date ${args.drawDate} (${args.status})`);

  const cols: Col[] = [
    { header: "Project", width: 30 },
    { header: "Loan #", width: 12 },
    { header: "Category", width: 24 },
    { header: "Vendor", width: 28 },
    { header: "Invoice #", width: 16 },
    { header: "Amount", width: 14, money: true },
  ];
  addColumnHeader(ws, cols);
  for (const group of args.summary.groups) {
    for (const row of group.rows) {
      addDataRow(ws, cols, [row.project, row.loanNumber, row.category, row.vendor, row.invoiceNumber, row.amount]);
    }
    addTotalRow(ws, cols, [`TOTAL — Loan #${group.loanNumber}`, "", "", "", "", group.subtotal]);
    ws.addRow([]);
  }
  addTotalRow(ws, cols, ["GRAND TOTAL", "", "", "", "", args.summary.grandTotal]);
  if (args.notes) {
    ws.addRow([]);
    addSectionTitle(ws, "Notes");
    const noteRow = ws.addRow([args.notes]);
    noteRow.getCell(1).alignment = { wrapText: true };
  }

  // Sheet 2 — flat invoice list
  const inv = wb.addWorksheet("Invoices");
  addHeader(inv, "Invoices in This Draw", `Draw date ${args.drawDate}`);
  const iCols: Col[] = [
    { header: "Vendor", width: 30 },
    { header: "Invoice #", width: 18 },
    { header: "Project", width: 30 },
    { header: "Loan #", width: 12 },
    { header: "Category", width: 24 },
    { header: "Amount", width: 14, money: true },
  ];
  addColumnHeader(inv, iCols);
  let invTotal = 0;
  for (const group of args.summary.groups) {
    for (const row of group.rows) {
      invTotal += row.amount;
      addDataRow(inv, iCols, [row.vendor, row.invoiceNumber, row.project, row.loanNumber, row.category, row.amount]);
    }
  }
  addTotalRow(inv, iCols, ["Total", "", "", "", "", invTotal]);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const filename = `Draw-Request-${args.drawDate}.xlsx`.replace(/\s+/g, "-");
  return { buffer: Buffer.from(arrayBuffer as ArrayBuffer), filename };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function renderReportXlsx(
  slug: ReportSlug,
  params: ReportParams
): Promise<{ buffer: Buffer; filename: string }> {
  const data = await getReportData(slug, params);

  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  wb.created = new Date();

  switch (slug) {
    case "income-statement":
      buildIncomeStatement(wb, data as IncomeStatementData, params);
      break;
    case "balance-sheet":
      buildBalanceSheet(wb, data as BalanceSheetData, params);
      break;
    case "cash-flow":
      buildCashFlow(wb, data as CashFlowData, params);
      break;
    case "financial-summary":
      buildFinancialSummary(wb, data as FinancialSummaryData, params);
      break;
    case "ap-aging":
      buildAPAging(wb, data as APAgingData, params);
      break;
    case "wip":
      buildWip(wb, data as WIPReportData, params);
      break;
    case "vendor-spend":
      buildVendorSpend(wb, data as VendorSpendData, params);
      break;
    case "tax-export":
      buildTaxExport(wb, data as TaxExportData);
      break;
    case "stage-progress":
      buildStageProgress(wb, data as StageProgressData);
      break;
    case "field-logs":
      buildFieldLogs(wb, data as FieldLogsData, params);
      break;
    case "job-cost":
      buildJobCost(wb, data as JobCostData);
      break;
    case "budget-variance":
      buildBudgetVariance(wb, data as BudgetVarianceData);
      break;
    case "selections":
      buildSelections(wb, data as SelectionsData);
      break;
    case "gantt":
      buildGantt(wb, data as GanttData);
      break;
    case "subdivision-overview":
      buildSubdivisionOverview(wb, data as SubdivisionOverviewData);
      break;
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  const filename = REPORTS[slug].filename(params).replace(/\.pdf$/i, ".xlsx").replace(/\s+/g, "-");
  return { buffer: Buffer.from(arrayBuffer as ArrayBuffer), filename };
}
