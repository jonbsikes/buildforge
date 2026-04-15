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

interface CostCodeRow {
  code: string;
  name: string;
  budget: number;
  committed: number;
  actual: number;
}

export interface JobCostData {
  projectName: string;
  projectAddress: string;
  rows: CostCodeRow[];
  totBudget: number;
  totCommitted: number;
  totActual: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<JobCostData> {
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
    .select("id, cost_code_id, budgeted_amount, cost_codes(code, name)")
    .eq("project_id", projectId)
    .eq("enabled", true);

  // Fetch contracts (committed)
  const { data: contractData } = await supabase
    .from("contracts")
    .select("cost_code_id, amount")
    .eq("project_id", projectId)
    .eq("status", "active");

  // Fetch invoices (actual) — need to join through invoice_line_items
  const { data: invoiceLineData } = await supabase
    .from("invoice_line_items")
    .select("cost_code, amount, invoice:invoices(project_id, status)");

  const committedMap: Record<string, number> = {};
  for (const c of contractData ?? []) {
    if (c.cost_code_id) {
      committedMap[c.cost_code_id] = (committedMap[c.cost_code_id] ?? 0) + (c.amount ?? 0);
    }
  }

  const actualMap: Record<string, number> = {};
  for (const il of invoiceLineData ?? []) {
    const inv = il.invoice as any;
    if (inv?.project_id === projectId && inv?.status && ["approved", "released", "cleared"].includes(inv.status) && il.cost_code) {
      actualMap[il.cost_code] = (actualMap[il.cost_code] ?? 0) + (il.amount ?? 0);
    }
  }

  const rows: CostCodeRow[] = (pccData ?? [])
    .map((pcc: any) => {
      const cc = pcc.cost_codes;
      if (!cc) return null;
      return {
        code: cc.code,
        name: cc.name,
        budget: pcc.budgeted_amount ?? 0,
        committed: committedMap[pcc.cost_code_id] ?? 0,
        actual: actualMap[cc.code] ?? 0,
      };
    })
    .filter((r): r is CostCodeRow => r !== null)
    .sort((a, b) => parseInt(a.code) - parseInt(b.code));

  const totBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totCommitted = rows.reduce((s, r) => s + r.committed, 0);
  const totActual = rows.reduce((s, r) => s + r.actual, 0);

  return {
    projectName: proj?.name ?? "—",
    projectAddress: proj?.address ?? "—",
    rows,
    totBudget,
    totCommitted,
    totActual,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const columns: Column<CostCodeRow>[] = [
  { key: "code", label: "Code", width: 12 },
  { key: "name", label: "Description", width: 38 },
  { key: "budget", label: "Budget", width: 12, align: "right", render: (r) => fmtMoney(r.budget) },
  { key: "committed", label: "Committed", width: 12, align: "right", render: (r) => fmtMoney(r.committed) },
  { key: "actual", label: "Actual", width: 12, align: "right", render: (r) => fmtMoney(r.actual) },
  { key: "variance", label: "Variance", width: 12, align: "right", render: (r) => {
    const v = r.budget - r.actual;
    return <Text style={{ color: v < 0 ? colors.red : colors.green }}>{fmtMoney(v)}</Text>;
  }},
  { key: "pct", label: "% Used", width: 10, align: "right", render: (r) => fmtPct((r.actual / r.budget) * 100, 0) },
];

export function Pdf({ data, params, logo }: { data: JobCostData; params: ReportParams; logo?: Buffer | string }) {
  return (
    <ReportDocument
      title="Job Cost Report"
      subtitle={`${data.projectName} • ${data.projectAddress}`}
      logo={logo}
    >
      <SectionHeading>Cost Codes</SectionHeading>
      {data.rows.length === 0 ? (
        <Empty>No cost codes for this project.</Empty>
      ) : (
        <View>
          <Table columns={columns} rows={data.rows} />
          <TotalRow
            label="TOTAL"
            value={fmtMoney(data.totActual)}
            labelWidth={62}
            color="default"
          />
        </View>
      )}
    </ReportDocument>
  );
}
