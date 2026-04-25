import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  fmtPct,
  formatAsOf,
  Table,
  SectionHeading,
  Empty,
  type Column,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WIPRow {
  id: string;
  name: string;
  total_budget: number;
  costs_to_date: number;
  ledger_wip: number;
  pct_complete: number;
  estimated_profit: number;
}

export interface WIPReportData {
  rows: WIPRow[];
  totalContractPrice: number;
  totalCosts: number;
  totalLedgerWIP: number;
  totalEstimatedProfit: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<WIPReportData> {
  const supabase = await createClient();
  const asOf = p.asOf!;

  // Get all active projects
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status")
    .eq("status", "active")
    .order("name");

  // Get per-project budget totals from project_cost_codes
  const { data: pccRows } = await supabase
    .from("project_cost_codes")
    .select("project_id, budgeted_amount");

  const budgetByProject: Record<string, number> = {};
  for (const row of pccRows ?? []) {
    if (row.project_id) {
      budgetByProject[row.project_id] = (budgetByProject[row.project_id] ?? 0) + (row.budgeted_amount ?? 0);
    }
  }

  // Get approved/released/cleared invoice line items (by line item project)
  const { data: lineItems } = await supabase
    .from("invoice_line_items")
    .select("project_id, amount, invoices!inner ( status )")
    .in("invoices.status", ["approved", "released", "cleared"]);

  // Get ledger WIP balances from journal entries
  type LedgerRow = {
    project_id: string | null;
    debit: number | null;
    credit: number | null;
    account: { account_number: string } | null;
    journal_entry: { entry_date: string; status: string } | null;
  };
  const { data: ledgerLines } = await supabase
    .from("journal_entry_lines")
    .select(`
      project_id, debit, credit,
      account:chart_of_accounts(account_number),
      journal_entry:journal_entries(entry_date, status)
    `);

  // Build maps
  const invoiceMap: Record<string, number> = {};
  for (const li of lineItems ?? []) {
    if (li.project_id) {
      invoiceMap[li.project_id] = (invoiceMap[li.project_id] ?? 0) + (li.amount ?? 0);
    }
  }

  const wipMap: Record<string, number> = {};
  const postedLines = ((ledgerLines ?? []) as unknown as LedgerRow[]).filter((l) =>
    l.journal_entry?.status === "posted" &&
    (l.journal_entry?.entry_date ?? "") <= asOf
  );

  for (const line of postedLines) {
    const acc = line.account;
    if (!acc || !line.project_id) continue;
    if (acc.account_number === "1210" || acc.account_number === "1230" || acc.account_number === "1220") {
      const net = Number(line.debit ?? 0) - Number(line.credit ?? 0);
      wipMap[line.project_id] = (wipMap[line.project_id] ?? 0) + net;
    }
  }

  const rows: WIPRow[] = (projects ?? [])
    .filter((p) => (budgetByProject[p.id] ?? 0) > 0)
    .map((p) => {
      const contractPrice = budgetByProject[p.id] ?? 0;
      const costsToDdate = invoiceMap[p.id] ?? 0;
      const ledgerWip = wipMap[p.id] ?? 0;
      const pctComplete = contractPrice > 0 ? (costsToDdate / contractPrice) * 100 : 0;
      const estimatedProfit = contractPrice - costsToDdate;

      return {
        id: p.id,
        name: p.name,
        total_budget: contractPrice,
        costs_to_date: costsToDdate,
        ledger_wip: ledgerWip,
        pct_complete: Math.min(100, Math.max(0, pctComplete)),
        estimated_profit: estimatedProfit,
      };
    });

  const totalContractPrice = rows.reduce((s, r) => s + r.total_budget, 0);
  const totalCosts = rows.reduce((s, r) => s + r.costs_to_date, 0);
  const totalLedgerWIP = rows.reduce((s, r) => s + r.ledger_wip, 0);
  const totalEstimatedProfit = rows.reduce((s, r) => s + r.estimated_profit, 0);

  return {
    rows,
    totalContractPrice,
    totalCosts,
    totalLedgerWIP,
    totalEstimatedProfit,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function Pdf({ data, params, logo }: { data: WIPReportData; params: ReportParams; logo?: Buffer | string }) {
  const columns: Column<WIPRow>[] = [
    { key: "name", label: "Project", width: 30 },
    { key: "contract", label: "Contract Price", width: 15, align: "right", getText: (r) => fmtMoney(r.total_budget) },
    { key: "costs", label: "Costs to Date", width: 15, align: "right", getText: (r) => fmtMoney(r.costs_to_date) },
    { key: "pct", label: "% Complete", width: 12, align: "right", getText: (r) => fmtPct(r.pct_complete, 1) },
    { key: "profit", label: "Estimated Profit", width: 15, align: "right", getText: (r) => fmtMoney(r.estimated_profit) },
    { key: "wip", label: "Ledger WIP", width: 13, align: "right", getText: (r) => fmtMoney(r.ledger_wip) },
  ];

  return (
    <ReportDocument
      title="Work in Progress Report"
      subtitle={formatAsOf(params.asOf!)}
      logo={logo}
    >
      <SectionHeading>Active Home Construction Projects</SectionHeading>

      {data.rows.length === 0 ? (
        <Empty>No active projects with contract prices.</Empty>
      ) : (
        <>
          <Table
            columns={columns}
            rows={data.rows}
            emptyText="No active projects with contract prices."
          />

          {/* Summary row */}
          <View style={{ marginTop: 12 }} wrap={false}>
            <View style={[styles.totalRow]}>
              <View style={{ width: "30%" }}>
                <Text style={[styles.tdStrong]}>Total</Text>
              </View>
              <View style={{ width: "15%" }}>
                <Text style={[styles.tdNumStrong]}>{fmtMoney(data.totalContractPrice)}</Text>
              </View>
              <View style={{ width: "15%" }}>
                <Text style={[styles.tdNumStrong]}>{fmtMoney(data.totalCosts)}</Text>
              </View>
              <View style={{ width: "12%" }}>
                <Text style={[styles.tdNumStrong]}>
                  {fmtPct(data.totalContractPrice > 0 ? (data.totalCosts / data.totalContractPrice) * 100 : 0, 1)}
                </Text>
              </View>
              <View style={{ width: "15%" }}>
                <Text style={[styles.tdNumStrong, { color: data.totalEstimatedProfit >= 0 ? colors.green : colors.red }]}>
                  {fmtMoney(data.totalEstimatedProfit)}
                </Text>
              </View>
              <View style={{ width: "13%" }}>
                <Text style={[styles.tdNumStrong]}>{fmtMoney(data.totalLedgerWIP)}</Text>
              </View>
            </View>
          </View>

          {/* Net summary */}
          <View style={{ marginTop: 8 }}>
            <Text style={styles.sectionHeading}>Summary</Text>
            <View style={[styles.tr]} wrap={false}>
              <View style={{ width: "50%" }}>
                <Text style={styles.td}>Total Contract Value</Text>
              </View>
              <View style={{ width: "50%" }}>
                <Text style={styles.tdNum}>{fmtMoney(data.totalContractPrice)}</Text>
              </View>
            </View>
            <View style={[styles.tr, styles.trZebra]} wrap={false}>
              <View style={{ width: "50%" }}>
                <Text style={styles.td}>Less: Costs to Date</Text>
              </View>
              <View style={{ width: "50%" }}>
                <Text style={styles.tdNum}>{fmtMoney(data.totalCosts)}</Text>
              </View>
            </View>
            <View style={[styles.tr]} wrap={false}>
              <View style={{ width: "50%" }}>
                <Text style={[styles.tdStrong]}>Estimated Total Profit</Text>
              </View>
              <View style={{ width: "50%" }}>
                <Text style={[styles.tdNumStrong, { color: data.totalEstimatedProfit >= 0 ? colors.green : colors.red }]}>
                  {fmtMoney(data.totalEstimatedProfit)}
                </Text>
              </View>
            </View>
          </View>
        </>
      )}
    </ReportDocument>
  );
}
