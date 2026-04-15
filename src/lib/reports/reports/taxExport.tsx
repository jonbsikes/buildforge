// @ts-nocheck
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

  // ─ Income Statement (for the tax year)
  const { data: jelData } = await supabase
    .from("journal_entry_lines")
    .select(`
      debit, credit, description,
      account:chart_of_accounts(account_number, name, type),
      journal_entry:journal_entries(entry_date, status)
    `);

  const glLines = (jelData ?? []).filter((l: any) =>
    l.journal_entry?.status === "posted" &&
    l.journal_entry?.entry_date >= startDate &&
    l.journal_entry?.entry_date <= endDate
  );

  const byAccount: Record<string, { type: string; debit: number; credit: number }> = {};
  for (const line of glLines) {
    const acc = line.account as any;
    if (!acc) continue;
    const key = acc.account_number;
    if (!byAccount[key]) {
      byAccount[key] = { type: acc.type, debit: 0, credit: 0 };
    }
    byAccount[key].debit += Number(line.debit ?? 0);
    byAccount[key].credit += Number(line.credit ?? 0);
  }

  const calcAmount = (acc: any) => {
    const type = acc.type;
    return type === "revenue"
      ? acc.credit - acc.debit
      : type === "asset" || type === "expense" || type === "cogs"
      ? acc.debit - acc.credit
      : acc.credit - acc.debit;
  };

  const revenue = Object.values(byAccount)
    .filter((a: any) => a.type === "revenue")
    .reduce((s, a: any) => s + calcAmount(a), 0);

  const cogs = Object.values(byAccount)
    .filter((a: any) => a.type === "cogs")
    .reduce((s, a: any) => s + calcAmount(a), 0);

  const expenses = Object.values(byAccount)
    .filter((a: any) => a.type === "expense")
    .reduce((s, a: any) => s + calcAmount(a), 0);

  // ─ Balance Sheet (as of Dec 31 of tax year)
  const toBalanceRow = (type: string): BalanceSheetAccount[] =>
    Object.entries(byAccount)
      .filter(([, a]: any) => a.type === type)
      .map(([accNum, a]: any) => ({
        account: `${accNum}`,
        balance: calcAmount(a),
      }))
      .filter((row) => Math.abs(row.balance) > 0.01)
      .sort((a, b) => a.account.localeCompare(b.account));

  const assets = toBalanceRow("asset");
  const liabilities = toBalanceRow("liability");
  const equity = toBalanceRow("equity");

  // ─ Vendor 1099 totals (>$600)
  const { data: invoices } = await supabase
    .from("invoices")
    .select("vendor, amount, total_amount, status, invoice_date")
    .in("status", ["approved", "released", "cleared"])
    .gte("invoice_date", startDate)
    .lte("invoice_date", endDate);

  const vendorTotals: Record<string, number> = {};
  for (const inv of invoices ?? []) {
    const v = inv.vendor ?? "Unknown";
    const amt = inv.total_amount ?? inv.amount ?? 0;
    vendorTotals[v] = (vendorTotals[v] ?? 0) + amt;
  }

  const vendors1099 = Object.entries(vendorTotals)
    .filter(([, amt]) => amt >= 600)
    .map(([vendor, total]) => ({ vendor, total }))
    .sort((a, b) => b.total - a.total);

  // ─ Paid invoices register
  const paidInvoices: PaidInvoice[] = (invoices ?? [])
    .map((inv: any) => ({
      invoiceNumber: inv.invoice_number ?? "—",
      vendor: inv.vendor ?? "Unknown",
      date: inv.invoice_date ?? "—",
      amount: inv.total_amount ?? inv.amount ?? 0,
      project: "—",
    }))
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

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

export function Pdf({ data, params, logo }: { data: TaxExportData; params: ReportParams; logo?: string }) {
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
      width: 15,
      getText: (row) => row.invoiceNumber,
    },
    {
      key: "vendor",
      label: "Vendor",
      width: 30,
      getText: (row) => row.vendor,
    },
    {
      key: "date",
      label: "Date",
      width: 15,
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

      {/* Balance Sheet Summary */}
      <SectionHeading>Balance Sheet Summary</SectionHeading>
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

      {/* Vendor 1099 Totals */}
      <SectionHeading>Vendors – 1099 Reportable ($600+)</SectionHeading>
      {data.vendors1099.length === 0 ? (
        <Empty>No vendors with $600+ in payments.</Empty>
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

      {/* Paid Invoices Register */}
      <SectionHeading>Paid Invoices Register</SectionHeading>
      {data.paidInvoices.length === 0 ? (
        <Empty>No paid invoices for this period.</Empty>
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
