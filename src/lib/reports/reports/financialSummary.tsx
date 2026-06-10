import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  formatDateRange,
  KpiGrid,
  Table,
  SectionHeading,
  Empty,
  type Column,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string;
  wip_balance: number;
  loan_balance: number;
}

export interface FinancialSummaryData {
  cash: number;
  totalWIP: number;
  totalAssets: number;
  totalLiabilities: number;
  totalLoans: number;
  totalEquity: number;
  apOutstanding: number;
  /** P&L for the selected period (params.start–params.end) */
  periodRevenue: number;
  periodNetIncome: number;
  projectRows: ProjectRow[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<FinancialSummaryData> {
  const supabase = await createClient();

  // Server-side GL aggregation (same RPC as the Balance Sheet — per-account,
  // per-project totals from posted entries) plus loans and projects.
  type RpcRow = {
    account_number: string;
    account_name: string;
    account_type: string | null;
    account_subtype: string | null;
    total_debit: number;
    total_credit: number;
    project_id: string | null;
  };
  type PnlRow = {
    account_number: string;
    account_type: string;
    total_debit: number;
    total_credit: number;
  };

  const today = new Date().toISOString().split("T")[0];
  const periodStart = p.start ?? `${new Date().getFullYear()}-01-01`;
  const periodEnd = p.end ?? today;
  const [rpcRes, pnlRes, loansRes, projectsRes] = await Promise.all([
    (supabase.rpc as any)("get_balance_sheet_data", { p_as_of_date: today }),
    (supabase.rpc as any)("get_income_statement_data", { p_start: periodStart, p_end: periodEnd }),
    supabase.from("loans").select("project_id, current_balance, status").eq("status", "active"),
    supabase.from("projects").select("id, name").order("name"),
  ]);

  const rows = (rpcRes.data ?? []) as RpcRow[];

  // Period P&L (for the KPI cards — previously hardcoded to $0)
  let periodRevenue = 0, periodCogs = 0, periodExpenses = 0;
  for (const row of (pnlRes.data ?? []) as PnlRow[]) {
    if (row.account_type === "revenue") periodRevenue += Number(row.total_credit) - Number(row.total_debit);
    else if (row.account_type === "cogs") periodCogs += Number(row.total_debit) - Number(row.total_credit);
    else if (row.account_type === "expense") periodExpenses += Number(row.total_debit) - Number(row.total_credit);
  }
  const periodNetIncome = periodRevenue - periodCogs - periodExpenses;

  // Aggregate by account (the RPC returns per-account, per-project rows)
  const acctTotals: Record<string, { debit: number; credit: number; type: string; subtype: string }> = {};
  for (const row of rows) {
    const key = row.account_number;
    if (!acctTotals[key]) acctTotals[key] = { debit: 0, credit: 0, type: row.account_type ?? "", subtype: row.account_subtype ?? "" };
    acctTotals[key].debit += Number(row.total_debit);
    acctTotals[key].credit += Number(row.total_credit);
  }

  const getBalance = (acctNum: string) => {
    const a = acctTotals[acctNum];
    if (!a) return 0;
    if (a.type === "asset" || a.type === "expense" || a.type === "cogs") return a.debit - a.credit;
    return a.credit - a.debit;
  };

  const cash = getBalance("1000");
  const wip1210 = getBalance("1210");
  const wip1230 = getBalance("1230");
  const capInterest = getBalance("1220");
  const totalWIP = wip1210 + wip1230 + capInterest;
  const apOutstanding = getBalance("2000");

  // Calculate totals
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquityAccounts = 0;
  let revenue = 0, cogs = 0, expenses = 0;
  for (const [acctNum, a] of Object.entries(acctTotals)) {
    const balance = a.type === "asset" || a.type === "expense" || a.type === "cogs"
      ? a.debit - a.credit
      : a.credit - a.debit;
    if (a.type === "asset") totalAssets += balance;
    else if (a.type === "liability") totalLiabilities += balance;
    else if (a.type === "equity") totalEquityAccounts += balance;
    else if (a.type === "revenue") revenue += balance;
    else if (a.type === "cogs") cogs += balance;
    else if (a.type === "expense") expenses += balance;
  }
  const retainedEarnings = revenue - cogs - expenses;
  const totalEquity = totalEquityAccounts + retainedEarnings;

  // Loans — subtype 'loan' accounts only (number-range checks wrongly caught
  // 2110 accrued interest, 2200 customer deposits, 2300+, etc.)
  let totalLoans = 0;
  for (const a of Object.values(acctTotals)) {
    if (a.type === "liability" && a.subtype === "loan") {
      totalLoans += a.credit - a.debit;
    }
  }

  // WIP per project
  const projectWIP: Record<string, number> = {};
  for (const row of rows) {
    if (!row.project_id) continue;
    if (row.account_number === "1210" || row.account_number === "1220" || row.account_number === "1230") {
      projectWIP[row.project_id] = (projectWIP[row.project_id] ?? 0) + Number(row.total_debit) - Number(row.total_credit);
    }
  }

  // Loan per project
  const projectLoans: Record<string, number> = {};
  for (const loan of loansRes.data ?? []) {
    if (loan.project_id) {
      projectLoans[loan.project_id] = (projectLoans[loan.project_id] ?? 0) + (loan.current_balance ?? 0);
    }
  }

  const projects = projectsRes.data ?? [];
  const projectRows: ProjectRow[] = projects
    .map(p => ({
      id: p.id,
      name: p.name,
      wip_balance: projectWIP[p.id] ?? 0,
      loan_balance: projectLoans[p.id] ?? 0,
    }))
    .filter(p => Math.abs(p.wip_balance) > 0.01 || Math.abs(p.loan_balance) > 0.01);

  return {
    cash,
    totalWIP,
    totalAssets,
    totalLiabilities,
    totalLoans,
    totalEquity,
    apOutstanding,
    periodRevenue,
    periodNetIncome,
    projectRows,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function Pdf({ data, params, logo }: { data: FinancialSummaryData; params: ReportParams; logo?: Buffer | string }) {
  const kpis = [
    { label: "Revenue (Period)", value: fmtMoney(data.periodRevenue), tone: "green" as const },
    { label: "Net Income (Period)", value: fmtMoney(data.periodNetIncome), tone: data.periodNetIncome >= 0 ? "green" as const : "red" as const },
    { label: "Cash on Hand", value: fmtMoney(data.cash), tone: "brand" as const },
    { label: "Total WIP / CIP", value: fmtMoney(data.totalWIP), tone: "brand" as const },
    { label: "AP Outstanding", value: fmtMoney(data.apOutstanding), tone: "red" as const },
    { label: "Construction Loans", value: fmtMoney(data.totalLoans), tone: "default" as const },
  ];

  const projectColumns: Column<ProjectRow>[] = [
    { key: "name", label: "Project", width: 40 },
    { key: "wip", label: "WIP / CIP Balance", width: 30, align: "right", getText: (r) => fmtMoney(r.wip_balance) },
    { key: "loan", label: "Loan Balance", width: 30, align: "right", getText: (r) => fmtMoney(r.loan_balance) },
  ];

  return (
    <ReportDocument
      title="Financial Summary"
      subtitle={formatDateRange(params.start!, params.end!)}
      logo={logo}
    >
      {/* KPI Grid */}
      <KpiGrid items={kpis} />

      {/* Project WIP & Loans */}
      {data.projectRows.length > 0 && (
        <>
          <SectionHeading>WIP & Loan Balance by Project</SectionHeading>
          <Table
            columns={projectColumns}
            rows={data.projectRows}
            emptyText="No project data found."
          />
        </>
      )}

      {/* Balance Summary */}
      <View style={{ marginTop: 12 }}>
        <Text style={styles.sectionHeading}>Balance Sheet Summary (All-Time)</Text>
        <View style={[styles.tr]} wrap={false}>
          <View style={{ width: "70%" }}>
            <Text style={styles.td}>Total Assets</Text>
          </View>
          <View style={{ width: "30%" }}>
            <Text style={styles.tdNum}>{fmtMoney(data.totalAssets)}</Text>
          </View>
        </View>
        <View style={[styles.tr, styles.trZebra]} wrap={false}>
          <View style={{ width: "70%" }}>
            <Text style={styles.td}>Total Liabilities</Text>
          </View>
          <View style={{ width: "30%" }}>
            <Text style={styles.tdNum}>{fmtMoney(data.totalLiabilities)}</Text>
          </View>
        </View>
        <View style={[styles.tr]} wrap={false}>
          <View style={{ width: "70%" }}>
            <Text style={styles.td}>Total Equity</Text>
          </View>
          <View style={{ width: "30%" }}>
            <Text style={styles.tdNum}>{fmtMoney(data.totalEquity)}</Text>
          </View>
        </View>
      </View>
    </ReportDocument>
  );
}
