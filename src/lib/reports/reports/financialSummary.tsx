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
  netIncome: number;
  projectRows: ProjectRow[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<FinancialSummaryData> {
  const supabase = await createClient();
  const start = p.start!;
  const end = p.end!;

  // Narrow the PostgREST nested-join shape. Aliased joins aren't inferred.
  type LedgerRow = {
    debit: number | null;
    credit: number | null;
    project_id: string | null;
    account: { account_number: string; name: string; type: string | null } | null;
    journal_entry: { entry_date: string; status: string } | null;
  };

  const [ledgerRes, loansRes, projectsRes] = await Promise.all([
    supabase.from("journal_entry_lines").select(`
      debit, credit, project_id,
      account:chart_of_accounts(account_number, name, type),
      journal_entry:journal_entries(entry_date, status)
    `),
    supabase.from("loans").select("project_id, current_balance, status").eq("status", "active"),
    supabase.from("projects").select("id, name").order("name"),
  ]);

  // Filter to posted entries
  const lines = ((ledgerRes.data ?? []) as unknown as LedgerRow[]).filter((l) => l.journal_entry?.status === "posted");

  // Aggregate by account
  const acctTotals: Record<string, { debit: number; credit: number; type: string }> = {};
  for (const line of lines) {
    const acc = line.account;
    if (!acc) continue;
    const key = acc.account_number;
    if (!acctTotals[key]) acctTotals[key] = { debit: 0, credit: 0, type: acc.type ?? "" };
    acctTotals[key].debit += Number(line.debit ?? 0);
    acctTotals[key].credit += Number(line.credit ?? 0);
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
  const netIncome = revenue - cogs - expenses;
  const totalEquity = totalEquityAccounts + retainedEarnings;

  // Loans
  let totalLoans = 0;
  for (const [acctNum, a] of Object.entries(acctTotals)) {
    if (a.type === "liability" && acctNum >= "2100") {
      totalLoans += a.credit - a.debit;
    }
  }

  // WIP per project
  const projectWIP: Record<string, number> = {};
  for (const line of lines) {
    const acc = line.account;
    if (!acc || !line.project_id) continue;
    const pid = line.project_id;
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);

    if (acc.account_number === "1210" || acc.account_number === "1220" || acc.account_number === "1230") {
      projectWIP[pid] = (projectWIP[pid] ?? 0) + debit - credit;
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
    netIncome,
    projectRows,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function Pdf({ data, params, logo }: { data: FinancialSummaryData; params: ReportParams; logo?: Buffer | string }) {
  const kpis = [
    { label: "Revenue (Period)", value: fmtMoney(0), tone: "green" as const },
    { label: "Net Income (Period)", value: fmtMoney(data.netIncome), tone: data.netIncome >= 0 ? "green" as const : "red" as const },
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
