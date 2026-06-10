import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtMoney,
  fmtNumber,
  fmtPct,
  Table,
  Column,
  SectionHeading,
  KpiGrid,
  Empty,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeRow {
  name: string;
  block: string | null;
  lot: string | null;
  plan: string | null;
  status: string;
  pct_complete: number;
  contract_price: number;
}

export interface SubdivisionOverviewData {
  subdivisionName: string;
  totalHomes: number;
  underConstruction: number;
  completed: number;
  totalContractValue: number;
  totalSpend: number;
  homes: HomeRow[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<SubdivisionOverviewData> {
  const supabase = await createClient();

  // Determine subdivision — either from subdivisionId param or projectId's subdivision
  let subdivisionName = "";

  if (p.subdivisionId && !p.subdivisionId.includes("-")) {
    // It's a string subdivision name, not a UUID
    subdivisionName = p.subdivisionId;
  } else if (p.projectId) {
    // Fetch the project to get its subdivision
    const { data: proj } = await supabase
      .from("projects")
      .select("subdivision")
      .eq("id", p.projectId)
      .single();
    subdivisionName = proj?.subdivision ?? "";
  }

  if (!subdivisionName) {
    return {
      subdivisionName: "—",
      totalHomes: 0,
      underConstruction: 0,
      completed: 0,
      totalContractValue: 0,
      totalSpend: 0,
      homes: [],
    };
  }

  // Fetch all homes in this subdivision
  const { data: projectsData } = await supabase
    .from("projects")
    .select(
      "id, name, block, lot, plan, status, total_budget, start_date"
    )
    .eq("subdivision", subdivisionName)
    .eq("project_type", "home_construction");

  if (!projectsData || projectsData.length === 0) {
    return {
      subdivisionName,
      totalHomes: 0,
      underConstruction: 0,
      completed: 0,
      totalContractValue: 0,
      totalSpend: 0,
      homes: [],
    };
  }

  const subdivisionProjectIds = projectsData.map((pr) => pr.id);

  // Fetch stages to calculate % complete — only for this subdivision's homes
  // (the old all-rows query silently capped at PostgREST's 1,000-row limit)
  type StageRow = { project_id: string; status: string };
  const { data: stagesData } = await supabase
    .from("build_stages")
    .select("project_id, status")
    .in("project_id", subdivisionProjectIds);

  const stagesByProject: Record<string, StageRow[]> = {};
  for (const s of (stagesData ?? []) as StageRow[]) {
    if (!stagesByProject[s.project_id]) stagesByProject[s.project_id] = [];
    stagesByProject[s.project_id]!.push(s);
  }

  // Fetch invoices for actual spend — filtered server-side to these projects.
  // Aliased joins aren't inferred.
  type InvoiceLineRow = {
    amount: number | null;
    project_id: string | null;
    invoice: { status: string } | null;
  };
  const { data: invoiceLineData } = await supabase
    .from("invoice_line_items")
    .select("amount, project_id, invoice:invoices!inner(status)")
    .in("project_id", subdivisionProjectIds)
    .in("invoice.status", ["approved", "released", "cleared"]);

  const spendByProject: Record<string, number> = {};
  for (const il of ((invoiceLineData ?? []) as unknown as InvoiceLineRow[])) {
    if (il.project_id) {
      spendByProject[il.project_id] = (spendByProject[il.project_id] ?? 0) + (il.amount ?? 0);
    }
  }

  // Build home rows
  let underConstruction = 0;
  let completed = 0;
  let totalContractValue = 0;
  let totalSpend = 0;

  const homes: HomeRow[] = (projectsData ?? []).map((proj) => {
    const allStages = stagesByProject[proj.id] ?? [];
    const stages = allStages.filter((s) => s.status !== "skipped");
    const doneCount = stages.filter(
      (s) => s.status === "complete" || s.status === "completed",
    ).length;
    const pct = stages.length > 0 ? (doneCount / stages.length) * 100 : 0;
    const contractPrice = proj.total_budget ?? 0;
    const spend = spendByProject[proj.id] ?? 0;

    if (proj.status === "active") underConstruction++;
    if (proj.status === "completed") completed++;
    totalContractValue += contractPrice;
    totalSpend += spend;

    return {
      name: proj.name,
      block: proj.block,
      lot: proj.lot,
      plan: proj.plan,
      status: proj.status,
      pct_complete: pct,
      contract_price: contractPrice,
    };
  });

  return {
    subdivisionName,
    totalHomes: homes.length,
    underConstruction,
    completed,
    totalContractValue,
    totalSpend,
    homes: homes.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const homeCols: Column<HomeRow>[] = [
  { key: "name", label: "Home", width: 25, render: (h) => h.name },
  { key: "block", label: "Block/Lot", width: 15, render: (h) => `${h.block ?? "—"}/${h.lot ?? "—"}` },
  { key: "plan", label: "Plan", width: 15, render: (h) => h.plan ?? "—" },
  { key: "status", label: "Status", width: 15, align: "right", render: (h) => h.status.replace(/_/g, " ") },
  { key: "pct", label: "% Complete", width: 12, align: "right", render: (h) => fmtPct(h.pct_complete, 0) },
  { key: "price", label: "Contract Price", width: 18, align: "right", render: (h) => fmtMoney(h.contract_price) },
];

export function Pdf({ data, params, logo }: { data: SubdivisionOverviewData; params: ReportParams; logo?: Buffer | string }) {
  return (
    <ReportDocument
      title="Subdivision Overview"
      subtitle={data.subdivisionName}
      logo={logo}
    >
      <KpiGrid
        items={[
          { label: "Total Homes", value: fmtNumber(data.totalHomes) },
          { label: "Under Construction", value: fmtNumber(data.underConstruction) },
          { label: "Completed", value: fmtNumber(data.completed) },
          { label: "Total Contract Value", value: fmtMoney(data.totalContractValue), tone: "brand" },
        ]}
      />

      <SectionHeading>Homes</SectionHeading>
      {data.homes.length === 0 ? (
        <Empty>No homes in this subdivision.</Empty>
      ) : (
        <Table columns={homeCols} rows={data.homes} />
      )}
    </ReportDocument>
  );
}
