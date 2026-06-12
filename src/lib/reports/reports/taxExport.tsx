import { Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles } from "../pdf/styles";
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
  /** Paid personally by an owner (capital contribution) — no company cash; excluded from 1099 totals */
  ownerFunded: boolean;
}

export interface PnlAccountLine {
  account: string;
  amount: number;
}

export interface TrialBalanceRow {
  accountNumber: string; // "" for the synthetic retained-earnings row
  accountName: string;
  accountType: string;
  beginningBalance: number; // debit-positive signed
  yearDebits: number;
  yearCredits: number;
  endingBalance: number; // debit-positive signed
}

export interface GlExportLine {
  date: string;
  reference: string;
  description: string;
  accountNumber: string;
  accountName: string;
  project: string;
  debit: number | null;
  credit: number | null;
  sourceType: string;
}

export interface LoanScheduleRow {
  loanNumber: string;
  lender: string;
  project: string;
  interestRate: number | null;
  status: string;
  beginningBalance: number;
  advances: number;
  paydowns: number;
  endingBalance: number;
}

export interface CapInterestRow {
  project: string;
  invoiced: number; // cost codes 121/122 line items for the year
  accrued: number; // account 1220 net activity for the year
  total: number;
}

export interface ProjectWipRow {
  project: string;
  beginningWip: number;
  endingWip: number;
  loanBalance: number;
}

export interface TaxExportData {
  incomeStatement: IncomeStatementSummary;
  pnlRevenue: PnlAccountLine[];
  pnlCogs: PnlAccountLine[];
  pnlExpenses: PnlAccountLine[];
  trialBalance: TrialBalanceRow[];
  balanceSheetAssets: BalanceSheetAccount[];
  balanceSheetLiabilities: BalanceSheetAccount[];
  balanceSheetEquity: BalanceSheetAccount[];
  glLines: GlExportLine[];
  vendors1099: Vendor1099[];
  /** Cleared-in-year invoice dollars paid personally by owners — excluded from the 1099 totals */
  ownerFundedExcludedFrom1099: number;
  paidInvoices: PaidInvoice[];
  loanSchedule: LoanScheduleRow[];
  capInterest: CapInterestRow[];
  projectWip: ProjectWipRow[];
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
  const priorEndDate = `${year - 1}-12-31`;

  // ─ Income Statement: the tax YEAR's P&L activity only.
  // ─ Balance Sheet / Trial Balance: cumulative snapshots through THIS year end
  //   and through PRIOR year end — year activity is the difference.
  type PnlRow = {
    account_number: string;
    account_name: string;
    account_type: string | null;
    total_debit: number;
    total_credit: number;
  };
  type BsRow = PnlRow & { project_id: string | null };
  const [{ data: pnlData }, { data: bsEndData }, { data: bsBeginData }, { data: projectsData }] =
    await Promise.all([
      (supabase.rpc as any)("get_income_statement_data", { p_start: startDate, p_end: endDate }),
      (supabase.rpc as any)("get_balance_sheet_data", { p_as_of_date: endDate }),
      (supabase.rpc as any)("get_balance_sheet_data", { p_as_of_date: priorEndDate }),
      supabase.from("projects").select("id, name"),
    ]);

  const projectNames = new Map<string, string>();
  for (const pr of (projectsData ?? []) as { id: string; name: string }[]) {
    projectNames.set(pr.id, pr.name);
  }

  // ─ P&L: account-level detail + summary totals
  const pnlAgg: Record<string, { name: string; type: string; debit: number; credit: number }> = {};
  for (const row of (pnlData ?? []) as PnlRow[]) {
    const t = row.account_type ?? "";
    if (!["revenue", "cogs", "expense"].includes(t)) continue;
    const k = row.account_number;
    if (!pnlAgg[k]) pnlAgg[k] = { name: row.account_name, type: t, debit: 0, credit: 0 };
    pnlAgg[k].debit += Number(row.total_debit);
    pnlAgg[k].credit += Number(row.total_credit);
  }
  let revenue = 0, cogs = 0, expenses = 0;
  const pnlRevenue: PnlAccountLine[] = [];
  const pnlCogs: PnlAccountLine[] = [];
  const pnlExpenses: PnlAccountLine[] = [];
  for (const [num, a] of Object.entries(pnlAgg).sort(([x], [y]) => x.localeCompare(y))) {
    const amount = a.type === "revenue" ? a.credit - a.debit : a.debit - a.credit;
    if (Math.abs(amount) < 0.005) continue;
    const line = { account: `${num} · ${a.name}`, amount };
    if (a.type === "revenue") { revenue += amount; pnlRevenue.push(line); }
    else if (a.type === "cogs") { cogs += amount; pnlCogs.push(line); }
    else { expenses += amount; pnlExpenses.push(line); }
  }

  // ─ Cumulative per-account totals for both snapshots (project detail kept
  //   separately for the WIP tab)
  type Cum = { name: string; type: string; debit: number; credit: number };
  const aggByAccount = (rows: BsRow[]): Record<string, Cum> => {
    const m: Record<string, Cum> = {};
    for (const row of rows) {
      const k = row.account_number;
      if (!m[k]) m[k] = { name: row.account_name, type: row.account_type ?? "", debit: 0, credit: 0 };
      m[k].debit += Number(row.total_debit);
      m[k].credit += Number(row.total_credit);
    }
    return m;
  };
  const endCum = aggByAccount((bsEndData ?? []) as BsRow[]);
  const beginCum = aggByAccount((bsBeginData ?? []) as BsRow[]);

  // ─ Balance sheet sections (cumulative through year end)
  let cumRevenue = 0, cumCogs = 0, cumExpenses = 0;
  for (const [, a] of Object.entries(endCum)) {
    if (a.type === "revenue") cumRevenue += a.credit - a.debit;
    else if (a.type === "cogs") cumCogs += a.debit - a.credit;
    else if (a.type === "expense") cumExpenses += a.debit - a.credit;
  }
  const toBalanceRow = (type: string): BalanceSheetAccount[] =>
    Object.entries(endCum)
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

  // ─ Trial balance: beginning balance + year debits/credits + ending balance.
  //   P&L accounts start the year at zero; their pre-year cumulative balances
  //   roll into a synthetic "Retained Earnings — prior years" row (the system
  //   has no closing entries), so the TB foots to zero in both directions.
  const trialBalance: TrialBalanceRow[] = [];
  let priorRetained = 0;
  for (const [num, e] of Object.entries(endCum).sort(([x], [y]) => x.localeCompare(y))) {
    const b = beginCum[num] ?? { name: e.name, type: e.type, debit: 0, credit: 0 };
    const yearDebits = e.debit - b.debit;
    const yearCredits = e.credit - b.credit;
    const isPnl = ["revenue", "cogs", "expense"].includes(e.type);
    if (isPnl) {
      priorRetained += b.debit - b.credit;
      const ending = yearDebits - yearCredits;
      if (Math.abs(yearDebits) < 0.005 && Math.abs(yearCredits) < 0.005 && Math.abs(ending) < 0.005) continue;
      trialBalance.push({
        accountNumber: num, accountName: e.name, accountType: e.type,
        beginningBalance: 0, yearDebits, yearCredits, endingBalance: ending,
      });
    } else {
      const beginningBalance = b.debit - b.credit;
      const ending = e.debit - e.credit;
      if (
        Math.abs(beginningBalance) < 0.005 && Math.abs(yearDebits) < 0.005 &&
        Math.abs(yearCredits) < 0.005 && Math.abs(ending) < 0.005
      ) continue;
      trialBalance.push({
        accountNumber: num, accountName: e.name, accountType: e.type,
        beginningBalance, yearDebits, yearCredits, endingBalance: ending,
      });
    }
  }
  if (Math.abs(priorRetained) > 0.005) {
    trialBalance.push({
      accountNumber: "", accountName: "Retained Earnings — prior years (calculated)", accountType: "equity",
      beginningBalance: priorRetained, yearDebits: 0, yearCredits: 0, endingBalance: priorRetained,
    });
  }
  // Numeric order; the synthetic RE row sorts in with the equity accounts
  trialBalance.sort((a, b) => (a.accountNumber || "3999").localeCompare(b.accountNumber || "3999"));

  // ─ General Ledger detail: every posted JE line in the year. Paginate past
  //   PostgREST's 1,000-row cap.
  type GlRowRaw = {
    debit: number | null;
    credit: number | null;
    description: string | null;
    project_id: string | null;
    account: { account_number: string; name: string } | null;
    journal_entry: {
      entry_date: string;
      description: string | null;
      reference: string | null;
      source_type: string | null;
    } | null;
  };
  let glRaw: GlRowRaw[] = [];
  {
    const jelSelect = `
      debit, credit, description, project_id,
      account:chart_of_accounts(account_number, name),
      journal_entry:journal_entries!inner(entry_date, description, reference, status, source_type)
    `;
    let fromIdx = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: page } = await supabase
        .from("journal_entry_lines")
        .select(jelSelect)
        .eq("journal_entry.status", "posted")
        .gte("journal_entry.entry_date", startDate)
        .lte("journal_entry.entry_date", endDate)
        .order("id")
        .range(fromIdx, fromIdx + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      glRaw = glRaw.concat(page as unknown as GlRowRaw[]);
      if (page.length < PAGE_SIZE) break;
      fromIdx += PAGE_SIZE;
    }
  }
  const glLines: GlExportLine[] = glRaw
    .map((l) => ({
      date: l.journal_entry?.entry_date ?? "",
      reference: l.journal_entry?.reference ?? "",
      description: l.description || l.journal_entry?.description || "",
      accountNumber: l.account?.account_number ?? "",
      accountName: l.account?.name ?? "",
      project: l.project_id ? projectNames.get(l.project_id) ?? "" : "",
      debit: Number(l.debit ?? 0) > 0 ? Number(l.debit) : null,
      credit: Number(l.credit ?? 0) > 0 ? Number(l.credit) : null,
      sourceType: l.journal_entry?.source_type ?? "",
    }))
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.reference.localeCompare(b.reference)
    );

  // ─ Vendor 1099 totals + paid-invoice register — CASH BASIS:
  //   checks that CLEARED during the tax year (status 'cleared',
  //   payment_date in year). 1099s report what you actually paid, not what
  //   you were billed. Paginate past PostgREST's 1,000-row cap.
  type InvRow = {
    id: string;
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
        .select("id, invoice_number, vendor, amount, total_amount, payment_date, projects(name)")
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

  // Invoices paid personally by an owner (funding_source = 'owner_funded') moved
  // through Member Capital, not company cash — the company paid the vendor
  // nothing, so they are excluded from 1099 totals.
  const { data: ownerPaidRows } = await supabase
    .from("payment_invoices")
    .select("invoice_id, payment:payments!inner(funding_source, status)")
    .eq("payment.funding_source", "owner_funded")
    .neq("payment.status", "void");
  const ownerPaidInvoiceIds = new Set((ownerPaidRows ?? []).map((r) => r.invoice_id as string));

  const vendorTotals: Record<string, number> = {};
  let ownerFundedExcludedFrom1099 = 0;
  for (const inv of invoices) {
    const amt = inv.total_amount ?? inv.amount ?? 0;
    if (ownerPaidInvoiceIds.has(inv.id)) {
      ownerFundedExcludedFrom1099 += amt;
      continue;
    }
    const v = inv.vendor ?? "Unknown";
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
      ownerFunded: ownerPaidInvoiceIds.has(inv.id),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // ─ Loan schedule: per-loan beginning/ending balance and year activity from
  //   the loan's own liability account (220x), via the two cumulative snapshots
  type LoanRow = {
    loan_number: string | null;
    interest_rate: number | null;
    status: string | null;
    lender: { name: string } | null;
    project: { name: string } | null;
    coa: { account_number: string } | null;
  };
  const { data: loansData } = await supabase
    .from("loans")
    .select("loan_number, interest_rate, status, lender:contacts(name), project:projects(name), coa:chart_of_accounts(account_number)");
  const loanSchedule: LoanScheduleRow[] = [];
  for (const ln of (loansData ?? []) as unknown as LoanRow[]) {
    const acct = ln.coa?.account_number;
    const e = acct ? endCum[acct] : undefined;
    const b = acct ? beginCum[acct] : undefined;
    const beginningBalance = b ? b.credit - b.debit : 0;
    const endingBalance = e ? e.credit - e.debit : 0;
    const advances = (e?.credit ?? 0) - (b?.credit ?? 0);
    const paydowns = (e?.debit ?? 0) - (b?.debit ?? 0);
    if (
      Math.abs(beginningBalance) < 0.005 && Math.abs(endingBalance) < 0.005 &&
      Math.abs(advances) < 0.005 && Math.abs(paydowns) < 0.005
    ) continue;
    loanSchedule.push({
      loanNumber: ln.loan_number ?? "—",
      lender: ln.lender?.name ?? "—",
      project: ln.project?.name ?? "—",
      interestRate: ln.interest_rate,
      status: ln.status ?? "",
      beginningBalance, advances, paydowns, endingBalance,
    });
  }
  loanSchedule.sort((a, b) => a.loanNumber.localeCompare(b.loanNumber));

  // ─ Capitalized interest by project: invoice line items on Loan Interest
  //   cost codes 121/122 (invoice date in year, approved or later) plus net
  //   activity in 1220 Capitalized Interest (period-end accruals)
  type IntLine = {
    amount: number | null;
    project_id: string | null;
    invoice: { project_id: string | null } | null;
  };
  const { data: intLinesData } = await supabase
    .from("invoice_line_items")
    .select("amount, project_id, invoice:invoices!inner(project_id, status, invoice_date)")
    .in("cost_code", ["121", "122"])
    .in("invoice.status", ["approved", "released", "cleared"])
    .gte("invoice.invoice_date", startDate)
    .lte("invoice.invoice_date", endDate);
  const capByProject: Record<string, { invoiced: number; accrued: number }> = {};
  const capRow = (name: string) => {
    if (!capByProject[name]) capByProject[name] = { invoiced: 0, accrued: 0 };
    return capByProject[name];
  };
  for (const li of (intLinesData ?? []) as unknown as IntLine[]) {
    const pid = li.project_id ?? li.invoice?.project_id;
    const name = pid ? projectNames.get(pid) ?? "Unassigned" : "Company-level";
    capRow(name).invoiced += Number(li.amount ?? 0);
  }
  for (const l of glRaw) {
    if (l.account?.account_number !== "1220") continue;
    const name = l.project_id ? projectNames.get(l.project_id) ?? "Unassigned" : "Company-level";
    capRow(name).accrued += Number(l.debit ?? 0) - Number(l.credit ?? 0);
  }
  const capInterest: CapInterestRow[] = Object.entries(capByProject)
    .map(([project, v]) => ({ project, invoiced: v.invoiced, accrued: v.accrued, total: v.invoiced + v.accrued }))
    .filter((r) => Math.abs(r.total) > 0.005 || Math.abs(r.invoiced) > 0.005 || Math.abs(r.accrued) > 0.005)
    .sort((a, b) => a.project.localeCompare(b.project));

  // ─ Project WIP: beginning/ending WIP-CIP per project (1210 + 1220 + 1230)
  //   from the two snapshots; year-end loan balance per project from the
  //   loan schedule
  const WIP_ACCOUNTS = new Set(["1210", "1220", "1230"]);
  const wipByProject = (rows: BsRow[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const row of rows) {
      if (!WIP_ACCOUNTS.has(row.account_number) || !row.project_id) continue;
      m.set(row.project_id, (m.get(row.project_id) ?? 0) + Number(row.total_debit) - Number(row.total_credit));
    }
    return m;
  };
  const wipEnd = wipByProject((bsEndData ?? []) as BsRow[]);
  const wipBegin = wipByProject((bsBeginData ?? []) as BsRow[]);
  const loanByProject = new Map<string, number>();
  for (const ln of loanSchedule) {
    loanByProject.set(ln.project, (loanByProject.get(ln.project) ?? 0) + ln.endingBalance);
  }
  const projectWip: ProjectWipRow[] = [...new Set([...wipEnd.keys(), ...wipBegin.keys()])]
    .map((pid) => {
      const project = projectNames.get(pid) ?? "Unknown";
      return {
        project,
        beginningWip: wipBegin.get(pid) ?? 0,
        endingWip: wipEnd.get(pid) ?? 0,
        loanBalance: loanByProject.get(project) ?? 0,
      };
    })
    .filter((r) => Math.abs(r.beginningWip) > 0.005 || Math.abs(r.endingWip) > 0.005 || Math.abs(r.loanBalance) > 0.005)
    .sort((a, b) => a.project.localeCompare(b.project));

  return {
    incomeStatement: {
      revenue,
      cogs,
      expenses,
      netIncome: revenue - cogs - expenses,
    },
    pnlRevenue,
    pnlCogs,
    pnlExpenses,
    trialBalance,
    balanceSheetAssets: assets,
    balanceSheetLiabilities: liabilities,
    balanceSheetEquity: equity,
    glLines,
    vendors1099,
    ownerFundedExcludedFrom1099,
    paidInvoices,
    loanSchedule,
    capInterest,
    projectWip,
    taxYear: year,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function Pdf({ data, params: _params, logo }: { data: TaxExportData; params: ReportParams; logo?: Buffer | string }) {
  // Account-level P&L columns
  const isColumns: Column<PnlAccountLine>[] = [
    {
      key: "account",
      label: "Account",
      width: 70,
      getText: (row) => row.account,
    },
    {
      key: "amount",
      label: "Amount",
      width: 30,
      align: "right",
      render: (row) => <Text style={styles.tdNumStrong}>{fmtMoney(row.amount)}</Text>,
    },
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
      subtitle={`For Tax Year ${data.taxYear} — full schedules in the Excel workbook`}
      logo={logo}
    >
      {/* Income Statement — account level */}
      <SectionHeading>Income Statement</SectionHeading>
      <SubHeading>Revenue</SubHeading>
      {data.pnlRevenue.length === 0 ? (
        <Empty>No revenue activity.</Empty>
      ) : (
        <Table columns={isColumns} rows={data.pnlRevenue} zebra={false} />
      )}
      <SubHeading>Cost of Goods Sold</SubHeading>
      {data.pnlCogs.length === 0 ? (
        <Empty>No COGS activity.</Empty>
      ) : (
        <Table columns={isColumns} rows={data.pnlCogs} zebra={false} />
      )}
      <SubHeading>Operating Expenses</SubHeading>
      {data.pnlExpenses.length === 0 ? (
        <Empty>No operating expense activity.</Empty>
      ) : (
        <Table columns={isColumns} rows={data.pnlExpenses} zebra={false} />
      )}
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
      {data.ownerFundedExcludedFrom1099 > 0.005 && (
        <Text style={{ fontSize: 8, color: "#64748B", marginTop: 4 }}>
          Excludes {fmtMoney(data.ownerFundedExcludedFrom1099)} of invoices paid personally by owners
          (recorded as capital contributions — the company paid no cash, so they are not 1099-reportable).
        </Text>
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
