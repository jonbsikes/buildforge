import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  fmtDate,
  SectionHeading,
  SubHeading,
  Table,
  TotalRow,
  Empty,
  Column,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomeStatementSummary {
  revenue: number;
  cogs: number;
  expenses: number;
  netIncome: number;
}

interface BalanceSheetAccount {
  account: string;
  balance: number;
}

interface Vendor1099 {
  vendor: string;
  total: number;
}

interface PaidInvoice {
  invoiceNumber: string;
  vendor: string;
  date: string;
  amount: number;
  project: string;
}

export interface TaxExportData {
  incomeStatement: IncomeStatementSummary;
  balanceSheetAssets: BalanceSheetAccount[];
  balanceSheetLiabilities: BalanceSheetAccount[];
  balanceSheetEquity: BalanceSheetAccount[];
  vendors1099: Vendor1099[];
  paidInvoices: PaidInvoice[];
  taxYear: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<TaxExportData> {
  const supabase = await createClient();

  // Determine the fiscal year
  let year: number;
  if (p.year) {
    year = parseInt(p.year, 10);
  } else if (p.end) {
    year = new Date(p.end).getFullYear();
  } else {
    year = new Date().getFullYear();
  }

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // ─ Income Statement: the tax YEAR's P&L activity only.
  // ─ Balance Sheet: CUMULATIVE balances as of Dec 31 (all entries from
  //   inception through year end — not just the year's activity).
  type PnlRow = {
    account_number: string;
    account_name: string;
    account_type: string | null;
    total_debit: number;
    total_credit: number;
  };
  type BsRow = PnlRow & { project_id: string | null };
  const [{ data: pnlData }, { data: bsData }] = await Promise.all([
    (supabase.rpc as any)("get_income_statement_data", { p_start: startDate, p_end: endDate }),
    (supabase.rpc as any)("get_balance_sheet_data", { p_as_of_date: endDate }),
  ]);

  let revenue = 0, cogs = 0, expenses = 0;
  for (const row of (pnlData ?? []) as PnlRow[]) {
    const t = row.account_type ?? "";
    if (t === "revenue") revenue += Number(row.total_credit) - Number(row.total_debit);
    else if (t === "cogs") cogs += Number(row.total_debit) - Number(row.total_credit);
    else if (t === "expense") expenses += Number(row.total_debit) - Number(row.total_credit);
  }

  // Aggregate the balance sheet RPC (per-account, per-project rows) by account
  type AcctTotal = { name: string; type: string; debit: number; credit: number };
  const byAccount: Record<string, AcctTotal> = {};
  let cumRevenue = 0, cumCogs = 0, cumExpenses = 0;
  for (const row of (bsData ?? []) as BsRow[]) {
    const t = row.account_type ?? "";
    if (t === "revenue") { cumRevenue += Number(row.total_credit) - Number(row.total_debit); continue; }
    if (t === "cogs") { cumCogs += Number(row.total_debit) - Number(row.total_credit); continue; }
    if (t === "expense") { cumExpenses += Number(row.total_debit) - Number(row.total_credit); continue; }
    if (!["asset", "liability", "equity"].includes(t)) continue;
    const key = row.account_number;
    if (!byAccount[key]) byAccount[key] = { name: row.account_name, type: t, debit: 0, credit: 0 };
    byAccount[key].debit += Number(row.total_debit);
    byAccount[key].credit += Number(row.total_credit);
  }

  const toBalanceRow = (type: string): BalanceSheetAccount[] =>
    Object.entries(byAccount)
      .filter(([, a]) => a.type === type)
      .map(([accNum, a]) => ({
        account: `${accNum} · ${a.name}`,
        balance: type === "asset" ? a.debit - a.credit : a.credit - a.debit,
      }))
      .filter((row) => Math.abs(row.balance) > 0.01)
      .sort((a, b) => a.account.localeCompare(b.account));

  const assets = toBalanceRow("asset");
  const liabilities = toBalanceRow("liability");
  const equity = toBalanceRow("equity");
  // Retained earnings through year end so the balance sheet section balances
  const retainedThroughYearEnd = cumRevenue - cumCogs - cumExpenses;
  if (Math.abs(retainedThroughYearEnd) > 0.01) {
    equity.push({ account: "Retained Earnings (Net Income to Date)", balance: retainedThroughYearEnd });
  }

  // ─ Vendor 1099 totals + paid-invoice register — CASH BASIS:
  //   checks that CLEARED during the tax year (status 'cleared',
  //   payment_date in year). 1099s report what you actually paid, not what
  //   you were billed. Paginate past PostgREST's 1,000-row cap.
  type InvRow = {
    invoice_number: string | null;
    vendor: string | null;
    amount: number | null;
    total_amount: number | null;
    payment_date: string | null;
    projects: { name: string } | null;
  };
  let invoices: InvRow[] = [];
  {
    let fromIdx = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: page } = await supabase
        .from("invoices")
        .select("invoice_number, vendor, amount, total_amount, payment_date, projects(name)")
        .eq("status", "cleared")
        .gte("payment_date", startDate)
        .lte("payment_date", endDate)
        .order("payment_date")
        .range(fromIdx, fromIdx + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      invoices = invoices.concat(page as unknown as InvRow[]);
      if (page.length < PAGE_SIZE) break;
      fromIdx += PAGE_SIZE;
    }
  }

  const vendorTotals: Record<string, number> = {};
  for (const inv of invoices) {
    const v = inv.vendor ?? "Unknown";
    const amt = inv.total_amount ?? inv.amount ?? 0;
    vendorTotals[v] = (vendorTotals[v] ?? 0) + amt;
  }

  const vendors1099 = Object.entries(vendorTotals)
    .filter(([, amt]) => amt >= 600)
    .map(([vendor, total]) => ({ vendor, total }))
    .sort((a, b) => b.total - a.total);

  // ─ Paid invoices register (cleared in the tax year, by payment date)
  const paidInvoices: PaidInvoice[] = invoices
    .map((inv) => ({
      invoiceNumber: inv.invoice_number ?? "—",
      vendor: inv.vendor ?? "Unknown",
      date: inv.payment_date ?? "—",
      amount: inv.total_amount ?? inv.amount ?? 0,
      project: inv.projects?.name ?? "—",
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    incomeStatement: {
      revenue,
      cogs,
      expenses,
      netIncome: revenue - cogs - expenses,
    },
    balanceSheetAssets: assets,
    balanceSheetLiabilities: liabilities,
    balanceSheetEquity: equity,
    vendors1099,
    paidInvoices,
    taxYear: year,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function Pdf({ data, params, logo }: { data: TaxExportData; params: ReportParams; logo?: Buffer | string }) {
  // Income Statement columns
  const isColumns: Column<{ label: string; amount: number }>[] = [
    {
      key: "label",
      label: "Account",
      width: 70,
      getText: (row) => row.label,
    },
    {
      key: "amount",
      label: "Amount",
      width: 30,
      align: "right",
      render: (row) => <Text style={styles.tdNumStrong}>{fmtMoney(row.amount)}</Text>,
    },
  ];

  const isData = [
    { label: "Revenue", amount: data.incomeStatement.revenue },
    { label: "Cost of Goods Sold", amount: data.incomeStatement.cogs },
    { label: "Gross Profit", amount: data.incomeStatement.revenue - data.incomeStatement.cogs },
    { label: "Operating Expenses", amount: data.incomeStatement.expenses },
  ];

  // Balance Sheet columns
  const bsColumns: Column<BalanceSheetAccount>[] = [
    {
      key: "account",
      label: "Account",
      width: 70,
      getText: (row) => row.account,
    },
    {
      key: "balance",
      label: "Balance",
      width: 30,
      align: "right",
      render: (row) => <Text style={styles.tdNumStrong}>{fmtMoney(row.balance)}</Text>,
    },
  ];

  // Vendor 1099 columns
  const vendorColumns: Column<{ vendor: string; total: number }>[] = [
    {
      key: "vendor",
      label: "Vendor",
      width: 70,
      getText: (row) => row.vendor,
    },
    {
      key: "total",
      label: "Total",
      width: 30,
      align: "right",
      render: (row) => <Text style={styles.tdNumStrong}>{fmtMoney(row.total)}</Text>,
    },
  ];

  // Paid invoices columns
  const invoiceColumns: Column<PaidInvoice>[] = [
    {
      key: "number",
      label: "Invoice #",
      width: 14,
      getText: (row) => row.invoiceNumber,
    },
    {
      key: "vendor",
      label: "Vendor",
      width: 28,
      getText: (row) => row.vendor,
    },
    {
      key: "project",
      label: "Project",
      width: 24,
      getText: (row) => row.project,
    },
    {
      key: "date",
      label: "Paid Date",
      width: 14,
      getText: (row) => fmtDate(row.date),
    },
    {
      key: "amount",
      label: "Amount",
      width: 20,
      align: "right",
      render: (row) => <Text style={styles.tdNumStrong}>{fmtMoney(row.amount)}</Text>,
    },
  ];

  return (
    <ReportDocument
      title="Tax Package"
      subtitle={`For Tax Year ${data.taxYear}`}
      logo={logo}
    >
      {/* Income Statement Summary */}
      <SectionHeading>Income Statement Summary</SectionHeading>
      <Table columns={isColumns} rows={isData} zebra={false} />
      <TotalRow
        label="Net Income"
        value={fmtMoney(data.incomeStatement.netIncome)}
        labelWidth={70}
        color={data.incomeStatement.netIncome >= 0 ? "green" : "red"}
      />

      {/* Balance Sheet Summary — cumulative balances through year end */}
      <SectionHeading>Balance Sheet Summary (as of Dec 31, {data.taxYear})</SectionHeading>
      <SubHeading>Assets</SubHeading>
      {data.balanceSheetAssets.length === 0 ? (
        <Empty>No asset accounts.</Empty>
      ) : (
        <Table columns={bsColumns} rows={data.balanceSheetAssets} zebra={false} />
      )}

      <SubHeading>Liabilities</SubHeading>
      {data.balanceSheetLiabilities.length === 0 ? (
        <Empty>No liability accounts.</Empty>
      ) : (
        <Table columns={bsColumns} rows={data.balanceSheetLiabilities} zebra={false} />
      )}

      <SubHeading>Equity</SubHeading>
      {data.balanceSheetEquity.length === 0 ? (
        <Empty>No equity accounts.</Empty>
      ) : (
        <Table columns={bsColumns} rows={data.balanceSheetEquity} zebra={false} />
      )}

      {/* Vendor 1099 Totals — cash basis */}
      <SectionHeading>Vendors – 1099 Reportable ($600+) — Cash Paid in {data.taxYear}</SectionHeading>
      {data.vendors1099.length === 0 ? (
        <Empty>No vendors with $600+ in cleared payments.</Empty>
      ) : (
        <>
          <Table columns={vendorColumns} rows={data.vendors1099} emptyText="No vendors to report." />
          <TotalRow
            label="Total 1099 Payments"
            value={fmtMoney(data.vendors1099.reduce((s, v) => s + v.total, 0))}
            labelWidth={70}
            color="brand"
          />
        </>
      )}

      {/* Paid Invoices Register — cash basis */}
      <SectionHeading>Paid Invoices Register — Checks Cleared in {data.taxYear}</SectionHeading>
      {data.paidInvoices.length === 0 ? (
        <Empty>No invoices were paid (cleared) in this year.</Empty>
      ) : (
        <>
          <Table columns={invoiceColumns} rows={data.paidInvoices} emptyText="No invoices." />
          <TotalRow
            label="Total Invoices"
            value={fmtMoney(data.paidInvoices.reduce((s, i) => s + i.amount, 0))}
            labelWidth={65}
            color="brand"
          />
        </>
      )}
    </ReportDocument>
  );
}
