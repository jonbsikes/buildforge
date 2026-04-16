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
    .eq("project_type", projectType as "land_development" | "home_construction" | "general_admin")
    .order("name");

  if (p.status && p.status !== "all") {
    projQuery = projQuery.eq("status", p.status as any);
  }
  if (p.subdivision && p.subdivision !== "all") {
    projQuery = projQuery.eq("subdivision", p.subdivision as any);
  }

  const { data: projects } = await projQuery;
  const projectList: ProjectCol[] = (projects ?? []).map((pr) => ({
    id: pr.id,
    name: pr.name,
  }));
  const projectIds = projectList.map((pr) => pr.id);

  // Fetch cost codes for type
  const { data: ccData } = await supabase
    .from("cost_codes")
    .select("code, name, project_type")
    .eq("project_type", projectType as "land_development" | "home_construction" | "general_admin")
    .eq("is_active", true)
    .order("sort_order");

  // Fetch invoice line items for actuals
  let actualsMap: Record<string, Record<string, number>> = {};
  if (projectIds.length > 0) {
    const { data: lineData } = await supabase
      .from("invoice_line_items")
      .select("cost_code, amount, project_id, invoice:invoices!inner(status)")
      .in("project_id", projectIds)
      .in("invoice.status", ["approved", "released", "cleared"]);

    for (const row of lineData ?? []) {
      if (!row.cost_code || !row.project_id) continue;
      if (!actualsMap[row.cost_code]) actualsMap[row.cost_code] = {};
      actualsMap[row.cost_code][row.project_id] =
        (actualsMap[row.cost_code][row.project_id] ?? 0) + (row.amount ?? 0);
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
