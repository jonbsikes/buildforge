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
  type: string;
  total_budget: number;
  costs_to_date: number;
  ledger_wip: number;       // 1210 + 1230 + 1220 net balance from posted JEs
  capitalized_interest: number; // 1220 specifically
  pct_complete: number | null;  // null when no budget entered
}

export interface WIPReportData {
  rows: WIPRow[];
  totalBudget: number;
  totalCosts: number;
  totalLedgerWIP: number;
  totalCapInterest: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<WIPReportData> {
  const supabase = await createClient();
  const asOf = p.asOf!;

  // Active projects + server-side aggregates: per-project budget totals,
  // invoice line-item actuals, and ledger WIP balances (1210/1220/1230)
  // as of the report date. A project appears whenever it has a budget,
  // costs, or a ledger WIP balance — so the report total always ties to
  // the GL WIP/CIP accounts even when budgets haven't been entered yet.
  const [projectsRes, budgetsRes, actualsRes, wipRes] = await Promise.all([
    supabase.from("projects").select("id, name, project_type, status").eq("status", "active").order("name"),
    (supabase.rpc as any)("get_project_budget_totals"),
    (supabase.rpc as any)("get_invoice_line_actuals_by_project"),
    (supabase.rpc as any)("get_wip_balances_asof", { p_as_of: asOf }),
  ]);

  const projects = projectsRes.data ?? [];

  const budgetByProject: Record<string, number> = {};
  for (const row of (budgetsRes.data ?? []) as { project_id: string; total_budget: number }[]) {
    budgetByProject[row.project_id] = Number(row.total_budget);
  }

  const invoiceMap: Record<string, number> = {};
  for (const li of (actualsRes.data ?? []) as { project_id: string; total_amount: number }[]) {
    invoiceMap[li.project_id] = Number(li.total_amount);
  }

  const wipMap: Record<string, number> = {};
  const capIntMap: Record<string, number> = {};
  for (const row of (wipRes.data ?? []) as { project_id: string; account_number: string; total_debit: number; total_credit: number }[]) {
    const net = Number(row.total_debit) - Number(row.total_credit);
    wipMap[row.project_id] = (wipMap[row.project_id] ?? 0) + net;
    if (row.account_number === "1220") {
      capIntMap[row.project_id] = (capIntMap[row.project_id] ?? 0) + net;
    }
  }

  const rows: WIPRow[] = (projects ?? [])
    .map((p) => {
      const budget = budgetByProject[p.id] ?? 0;
      const costsToDate = invoiceMap[p.id] ?? 0;
      const ledgerWip = wipMap[p.id] ?? 0;
      const pctComplete = budget > 0 ? Math.min(100, Math.max(0, (costsToDate / budget) * 100)) : null;

      return {
        id: p.id,
        name: p.name,
        type: p.project_type === "land_development" ? "Land Dev" : "Home",
        total_budget: budget,
        costs_to_date: costsToDate,
        ledger_wip: ledgerWip,
        capitalized_interest: capIntMap[p.id] ?? 0,
        pct_complete: pctComplete,
      };
    })
    // Show every project that has money on it — budget, invoiced costs, or a
    // GL WIP balance. (The old `budget > 0` filter rendered an empty report
    // whenever budgets hadn't been entered.)
    .filter((r) => r.total_budget > 0 || Math.abs(r.costs_to_date) > 0.004 || Math.abs(r.ledger_wip) > 0.004);

  const totalBudget = rows.reduce((s, r) => s + r.total_budget, 0);
  const totalCosts = rows.reduce((s, r) => s + r.costs_to_date, 0);
  const totalLedgerWIP = rows.reduce((s, r) => s + r.ledger_wip, 0);
  const totalCapInterest = rows.reduce((s, r) => s + r.capitalized_interest, 0);

  return {
    rows,
    totalBudget,
    totalCosts,
    totalLedgerWIP,
    totalCapInterest,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function Pdf({ data, params, logo }: { data: WIPReportData; params: ReportParams; logo?: Buffer | string }) {
  const columns: Column<WIPRow>[] = [
    { key: "name", label: "Project", width: 28 },
    { key: "type", label: "Type", width: 10, getText: (r) => r.type },
    { key: "budget", label: "Budget", width: 14, align: "right", getText: (r) => r.total_budget > 0 ? fmtMoney(r.total_budget) : "—" },
    { key: "costs", label: "Invoiced Costs", width: 14, align: "right", getText: (r) => fmtMoney(r.costs_to_date) },
    { key: "wip", label: "Ledger WIP / CIP", width: 14, align: "right", getText: (r) => fmtMoney(r.ledger_wip) },
    { key: "capint", label: "Cap. Interest", width: 10, align: "right", getText: (r) => r.capitalized_interest !== 0 ? fmtMoney(r.capitalized_interest) : "—" },
    { key: "pct", label: "% of Budget", width: 10, align: "right", getText: (r) => r.pct_complete == null ? "—" : fmtPct(r.pct_complete, 1) },
  ];

  return (
    <ReportDocument
      title="Work in Progress Report"
      subtitle={formatAsOf(params.asOf!)}
      logo={logo}
    >
      <SectionHeading>Active Projects</SectionHeading>

      {data.rows.length === 0 ? (
        <Empty>No active projects with budgets, costs, or WIP balances.</Empty>
      ) : (
        <>
          <Table
            columns={columns}
            rows={data.rows}
            emptyText="No active projects."
          />

          {/* Summary row */}
          <View style={{ marginTop: 12 }} wrap={false}>
            <View style={[styles.totalRow]}>
              <View style={{ width: "38%" }}>
                <Text style={[styles.tdStrong]}>Total</Text>
              </View>
              <View style={{ width: "14%" }}>
                <Text style={[styles.tdNumStrong]}>{data.totalBudget > 0 ? fmtMoney(data.totalBudget) : "—"}</Text>
              </View>
              <View style={{ width: "14%" }}>
                <Text style={[styles.tdNumStrong]}>{fmtMoney(data.totalCosts)}</Text>
              </View>
              <View style={{ width: "14%" }}>
                <Text style={[styles.tdNumStrong, { color: colors.brand }]}>{fmtMoney(data.totalLedgerWIP)}</Text>
              </View>
              <View style={{ width: "10%" }}>
                <Text style={[styles.tdNumStrong]}>{data.totalCapInterest !== 0 ? fmtMoney(data.totalCapInterest) : "—"}</Text>
              </View>
              <View style={{ width: "10%" }} />
            </View>
          </View>

          {/* Tie-out note */}
          <View style={{ marginTop: 8 }} wrap={false}>
            <Text style={[styles.small, { color: colors.muted }]}>
              Ledger WIP / CIP is the net balance of GL accounts 1210 (Construction WIP), 1230 (CIP — Land
              Improvements) and 1220 (Capitalized Interest) per project, from posted journal entries through the
              report date. The total above ties to those accounts on the Balance Sheet. Invoiced Costs counts
              approved, released and cleared invoice line items.
            </Text>
          </View>
        </>
      )}
    </ReportDocument>
  );
}
