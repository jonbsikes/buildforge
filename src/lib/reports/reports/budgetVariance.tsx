import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  fmtPct,
  Table,
  Column,
  SectionHeading,
  Empty,
  TotalRow,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VarianceRow {
  code: string;
  name: string;
  budget: number;
  actual: number;
}

export interface BudgetVarianceData {
  projectName: string;
  projectAddress: string;
  rows: VarianceRow[];
  totBudget: number;
  totActual: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<BudgetVarianceData> {
  const supabase = await createClient();
  const projectId = p.projectId!;

  // Fetch project
  const { data: proj } = await supabase
    .from("projects")
    .select("name, address")
    .eq("id", projectId)
    .single();

  // Fetch project cost codes with budgets
  const { data: pccData } = await supabase
    .from("project_cost_codes")
    .select("cost_code_id, budgeted_amount, cost_codes(code, name)")
    .eq("project_id", projectId)
    .eq("enabled", true);

  // Fetch invoices (actual) — sum from line items per cost code
  const { data: invoiceLineData } = await supabase
    .from("invoice_line_items")
    .select("cost_code, amount, invoice:invoices(project_id, status)");

  const actualMap: Record<string, number> = {};
  for (const il of invoiceLineData ?? []) {
    const inv = il.invoice as any;
    if (inv?.project_id === projectId && inv?.status && ["approved", "released", "cleared"].includes(inv.status) && il.cost_code) {
      actualMap[il.cost_code] = (actualMap[il.cost_code] ?? 0) + (il.amount ?? 0);
    }
  }

  const rows: VarianceRow[] = (pccData ?? [])
    .map((pcc: any) => {
      const cc = pcc.cost_codes;
      if (!cc) return null;
      const budget = pcc.budgeted_amount ?? 0;
      const actual = actualMap[cc.code] ?? 0;
      if (budget === 0 && actual === 0) return null;
      return {
        code: cc.code,
        name: cc.name,
        budget,
        actual,
      };
    })
    .filter((r): r is VarianceRow => r !== null)
    .sort((a, b) => (a.budget - a.actual) - (b.budget - b.actual)); // most overrun first

  const totBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totActual = rows.reduce((s, r) => s + r.actual, 0);

  return {
    projectName: proj?.name ?? "—",
    projectAddress: proj?.address ?? "—",
    rows,
    totBudget,
    totActual,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const columns: Column<VarianceRow>[] = [
  { key: "code", label: "Code", width: 12 },
  { key: "name", label: "Description", width: 38 },
  { key: "budget", label: "Budget", width: 15, align: "right", render: (r) => fmtMoney(r.budget) },
  { key: "actual", label: "Actual", width: 15, align: "right", render: (r) => fmtMoney(r.actual) },
  { key: "variance", label: "Variance", width: 15, align: "right", render: (r) => {
    const v = r.budget - r.actual;
    return <Text style={{ color: v < 0 ? colors.red : colors.green }}>{fmtMoney(v)}</Text>;
  }},
  { key: "pct", label: "% Used", width: 10, align: "right", render: (r) => {
    const pct = r.budget > 0 ? (r.actual / r.budget) * 100 : 0;
    return fmtPct(pct, 0);
  }},
];

export function Pdf({ data, params, logo }: { data: BudgetVarianceData; params: ReportParams; logo?: Buffer | string }) {
  return (
    <ReportDocument
      title="Budget Variance Report"
      subtitle={`${data.projectName} • ${data.projectAddress}`}
      logo={logo}
    >
      <SectionHeading>Variance Analysis</SectionHeading>
      {data.rows.length === 0 ? (
        <Empty>No cost code data for this project.</Empty>
      ) : (
        <View>
          <Table columns={columns} rows={data.rows} />
          <TotalRow
            label="TOTAL"
            value={fmtMoney(data.totBudget - data.totActual)}
            labelWidth={62}
            color={data.totBudget - data.totActual < 0 ? "red" : "green"}
          />
        </View>
      )}
    </ReportDocument>
  );
}
