import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  SectionHeading,
  Empty,
} from "../pdf/components";
import type { ReportParams } from "../types";
import type { Database } from "@/types/database";

type ProjectStatus = Database["public"]["Enums"]["project_status"];
type ProjectType = Database["public"]["Enums"]["project_type"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectCol {
  id: string;
  name: string;
}

interface CostCodeRow {
  code: string;
  name: string;
  projectActuals: Record<string, number>;
  total: number;
}

export interface JobCostData {
  subtitle: string;
  projects: ProjectCol[];
  rows: CostCodeRow[];
  projectTotals: Record<string, number>;
  grandTotal: number;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<JobCostData> {
  const supabase = await createClient();
  const projectType = p.projectType ?? "home_construction";

  // Build project query
  let projQuery = supabase
    .from("projects")
    .select("id, name, project_type, subdivision, status")
    .eq("project_type", projectType as ProjectType)
    .order("name");

  if (p.status && p.status !== "all") {
    projQuery = projQuery.eq("status", p.status as ProjectStatus);
  }
  if (p.subdivision && p.subdivision !== "all") {
    projQuery = projQuery.eq("subdivision", p.subdivision);
  }

  const { data: projects } = await projQuery;
  const projectList: ProjectCol[] = (projects ?? []).map((pr) => ({
    id: pr.id,
    name: pr.name,
  }));
  const projectIds = projectList.map((pr) => pr.id);

  // Fetch cost codes for type (include id for JE line mapping)
  const { data: ccData } = await supabase
    .from("cost_codes")
    .select("id, code, name, project_type")
    .eq("project_type", projectType as ProjectType)
    .eq("is_active", true)
    .order("sort_order");

  // Build cost_code_id → code lookup
  const ccIdToCode: Record<string, string> = {};
  for (const cc of ccData ?? []) ccIdToCode[cc.id] = cc.code;

  const actualsMap: Record<string, Record<string, number>> = {};
  if (projectIds.length > 0) {
    // Invoice line items. Aliased joins aren't inferred by PostgREST types.
    type InvoiceLineRow = {
      cost_code: string | null;
      amount: number | null;
      project_id: string | null;
      invoice: { status: string } | null;
    };
    const { data: lineData } = await supabase
      .from("invoice_line_items")
      .select("cost_code, amount, project_id, invoice:invoices!inner(status)")
      .in("project_id", projectIds);

    const allowedInvoiceStatuses = new Set(["approved", "released", "cleared"]);
    for (const row of ((lineData ?? []) as unknown as InvoiceLineRow[])) {
      if (!row.cost_code || !row.project_id) continue;
      if (!row.invoice || !allowedInvoiceStatuses.has(row.invoice.status)) continue;
      if (!actualsMap[row.cost_code]) actualsMap[row.cost_code] = {};
      actualsMap[row.cost_code][row.project_id] =
        (actualsMap[row.cost_code][row.project_id] ?? 0) + (row.amount ?? 0);
    }

    // Journal entry lines (manual JEs, lot costs, etc. — skip invoice-related to avoid double-counting)
    type JeLineRow = {
      cost_code_id: string | null;
      project_id: string | null;
      debit: number | null;
      credit: number | null;
      journal_entry: { status: string; source_type: string | null } | null;
    };
    const { data: jeLineData } = await supabase
      .from("journal_entry_lines")
      .select("cost_code_id, project_id, debit, credit, journal_entry:journal_entries!inner(status, source_type)")
      .in("project_id", projectIds)
      .not("cost_code_id", "is", null);

    for (const row of ((jeLineData ?? []) as unknown as JeLineRow[])) {
      const je = row.journal_entry;
      if (!je || je.status !== "posted") continue;
      if (je.source_type === "invoice_approval" || je.source_type === "invoice_payment") continue;
      if (!row.cost_code_id || !row.project_id) continue;

      const code = ccIdToCode[row.cost_code_id];
      if (!code) continue;

      const amount = (row.debit ?? 0) - (row.credit ?? 0);
      if (amount === 0) continue;

      if (!actualsMap[code]) actualsMap[code] = {};
      actualsMap[code][row.project_id] = (actualsMap[code][row.project_id] ?? 0) + amount;
    }
  }

  const rows: CostCodeRow[] = (ccData ?? []).map((cc) => {
    const projectActuals = actualsMap[cc.code] ?? {};
    const total = Object.values(projectActuals).reduce((s, v) => s + v, 0);
    return { code: cc.code, name: cc.name, projectActuals, total };
  });

  const projectTotals: Record<string, number> = {};
  for (const pr of projectList) {
    projectTotals[pr.id] = rows.reduce(
      (s, r) => s + (r.projectActuals[pr.id] ?? 0),
      0
    );
  }
  const grandTotal = Object.values(projectTotals).reduce((s, v) => s + v, 0);

  const typeLabel = projectType === "home_construction" ? "Home Construction" : "Land Development";
  const parts = [typeLabel];
  if (p.subdivision && p.subdivision !== "all") parts.push(p.subdivision);
  if (p.status && p.status !== "all") parts.push(p.status);

  return {
    subtitle: parts.join(" • "),
    projects: projectList,
    rows,
    projectTotals,
    grandTotal,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function Pdf({ data, params, logo }: { data: JobCostData; params: ReportParams; logo?: Buffer | string }) {
  const descWidth = 30;
  const totalWidth = 12;
  const projCount = data.projects.length;
  const projWidth = projCount > 0 ? Math.max(8, Math.floor((100 - descWidth - totalWidth) / projCount)) : 0;

  return (
    <ReportDocument
      title="Job Cost Report"
      subtitle={data.subtitle}
      logo={logo}
    >
      <SectionHeading>Actuals by Project</SectionHeading>
      {data.projects.length === 0 ? (
        <Empty>No projects match the selected filters.</Empty>
      ) : (
        <View style={styles.table}>
          {/* Header row */}
          <View style={styles.th}>
            <Text style={[styles.thCell, { width: `${descWidth}%` }]}>
              Description
            </Text>
            {data.projects.map((p) => (
              <Text
                key={p.id}
                style={[styles.thCell, { width: `${projWidth}%`, textAlign: "right" }]}
              >
                {p.name}
              </Text>
            ))}
            <Text style={[styles.thCell, { width: `${totalWidth}%`, textAlign: "right" }]}>
              Total
            </Text>
          </View>

          {/* Data rows */}
          {data.rows.map((r, i) => (
            <View
              key={r.code}
              style={[styles.tr, i % 2 === 1 ? styles.trZebra : {}]}
            >
              <Text style={[styles.td, { width: `${descWidth}%` }]}>
                {r.code} {r.name}
              </Text>
              {data.projects.map((p) => {
                const val = r.projectActuals[p.id] ?? 0;
                return (
                  <Text
                    key={p.id}
                    style={[styles.tdNum, { width: `${projWidth}%`, color: val > 0 ? colors.text : colors.faint }]}
                  >
                    {val > 0 ? fmtMoney(val) : "—"}
                  </Text>
                );
              })}
              <Text style={[styles.tdNumStrong, { width: `${totalWidth}%` }]}>
                {r.total > 0 ? fmtMoney(r.total) : "—"}
              </Text>
            </View>
          ))}

          {/* Totals row */}
          <View style={styles.totalRow}>
            <Text style={[styles.tdStrong, { width: `${descWidth}%` }]}>
              TOTAL
            </Text>
            {data.projects.map((p) => (
              <Text
                key={p.id}
                style={[styles.tdNumStrong, { width: `${projWidth}%` }]}
              >
                {fmtMoney(data.projectTotals[p.id] ?? 0)}
              </Text>
            ))}
            <Text style={[styles.tdNumStrong, { width: `${totalWidth}%` }]}>
              {fmtMoney(data.grandTotal)}
            </Text>
          </View>
        </View>
      )}
    </ReportDocument>
  );
}
