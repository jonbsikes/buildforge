// @ts-nocheck
import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtDate,
  fmtNumber,
  SectionHeading,
  SubHeading,
  Table,
  Empty,
  Column,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageRow {
  stageNumber: number;
  stageName: string;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  daysVariance: number | null;
  track: "exterior" | "interior";
}

export interface StageProgressData {
  projectId: string;
  projectName: string;
  projectAddress: string;
  stages: StageRow[];
  exteriorStages: StageRow[];
  interiorStages: StageRow[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<StageProgressData> {
  const supabase = await createClient();
  const projectId = p.projectId!;

  // Fetch project details
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, address")
    .eq("id", projectId)
    .single();

  // Fetch all build stages for this project
  const { data: stages } = await supabase
    .from("build_stages")
    .select("stage_number, status, planned_start_date, planned_end_date, actual_start_date, actual_end_date")
    .eq("project_id", projectId)
    .order("stage_number");

  // Map stage numbers to names using the master list
  const stageNames: Record<number, string> = {
    1: "Lot prep and layout",
    2: "Pad grading",
    3: "Temp utilities & site setup",
    4: "Foundation - Set forms & Trench",
    5: "Plumbing - Underground",
    6: "Electrical - Underground (ENT)",
    7: "Foundation (cables/rebar)",
    8: "Pour slab",
    9: "Construction Clean - 1/7 - Forms",
    10: "Rough grade",
    11: "Framing – walls & trusses",
    12: "Sheathing – walls and roof",
    13: "Weather barrier (WRB)",
    14: "Windows and exterior doors",
    15: "Water Well Install",
    16: "Plumbing - Top‑Out",
    17: "HVAC - Rough",
    18: "Roofing",
    19: "Electrical - Rough",
    20: "Construction Clean - 2/7 - Frame",
    21: "Siding – exterior cladding",
    22: "Insulation",
    23: "Drywall – hang, tape, texture",
    24: "Construction Clean - 3/7 - Drywall",
    25: "Garage door - Rough (door and tracks)",
    26: "Paint - Exterior",
    27: "Masonry/brick/stone",
    28: "Construction Clean - 4/7 - Brick",
    29: "Septic system rough in",
    30: "Interior doors & trim",
    31: "Cabinets",
    32: "Construction Clean - 5/7 - Trim",
    33: "Paint - interior",
    34: "Countertops",
    35: "Fireplace",
    36: "Construction Clean - 6/7 - Paint & Tile",
    37: "Flatwork – driveway, walks, patios",
    38: "Final grade",
    39: "Landscape/Irrigation - Rough",
    40: "Flooring Install",
    41: "Tile",
    42: "Electrical - Final",
    43: "Plumbing - Final",
    44: "HVAC - Final",
    45: "Hardware",
    46: "Garage door - Final (operator/opener)",
    47: "Appliances",
    48: "Mirrors/Glass",
    49: "Paint - interior finish & touch‑ups",
    50: "Gutter install",
    51: "Landscape - Final",
    52: "Construction Clean - 7/7 - Final",
    53: "Punch list & touch‑ups",
    54: "Final Clean",
    55: "Final inspections & utility releases",
  };

  // Exterior and Interior track assignments (from CLAUDE.md / build_stages.md)
  const exteriorStageNums = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 20, 21, 25, 26, 27, 28, 29, 37, 38, 39, 50, 51]);
  const interiorStageNums = new Set([16, 17, 19, 22, 23, 24, 30, 31, 32, 33, 34, 35, 36, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 52, 53, 54, 55]);

  // Build stage rows and calculate variance
  const stageRows: StageRow[] = (stages ?? []).map((s: any) => {
    const plannedStart = s.planned_start_date ? new Date(s.planned_start_date) : null;
    const plannedEnd = s.planned_end_date ? new Date(s.planned_end_date) : null;
    const actualStart = s.actual_start_date ? new Date(s.actual_start_date) : null;
    const actualEnd = s.actual_end_date ? new Date(s.actual_end_date) : null;

    let daysVariance: number | null = null;
    if (plannedEnd && actualEnd) {
      const plannedMs = plannedEnd.getTime();
      const actualMs = actualEnd.getTime();
      daysVariance = Math.round((actualMs - plannedMs) / (1000 * 60 * 60 * 24));
    }

    const track = exteriorStageNums.has(s.stage_number) ? "exterior" : interiorStageNums.has(s.stage_number) ? "interior" : "exterior";

    return {
      stageNumber: s.stage_number,
      stageName: stageNames[s.stage_number] || `Stage ${s.stage_number}`,
      status: s.status || "not_started",
      plannedStart: s.planned_start_date,
      plannedEnd: s.planned_end_date,
      actualStart: s.actual_start_date,
      actualEnd: s.actual_end_date,
      daysVariance,
      track,
    };
  });

  const allStages = stageRows.sort((a, b) => a.stageNumber - b.stageNumber);
  const exteriorStages = allStages.filter(s => s.track === "exterior");
  const interiorStages = allStages.filter(s => s.track === "interior");

  return {
    projectId,
    projectName: project?.name ?? "Unknown Project",
    projectAddress: project?.address ?? "",
    stages: allStages,
    exteriorStages,
    interiorStages,
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

function getStatusColor(status: string): string {
  switch (status) {
    case "complete":
      return colors.green;
    case "in_progress":
      return colors.brand;
    case "delayed":
      return colors.orange;
    case "not_started":
      return colors.muted;
    default:
      return colors.text;
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Text style={{ fontSize: 8, color: getStatusColor(status), fontFamily: "Helvetica-Bold" }}>
      {status.replace(/_/g, " ").toUpperCase()}
    </Text>
  );
}

function VarianceBadge({ variance }: { variance: number | null }) {
  if (variance === null) return <Text style={styles.muted}>—</Text>;
  const color = variance === 0 ? colors.green : variance > 0 ? colors.orange : colors.blue;
  return <Text style={{ fontSize: 8, color, fontFamily: "Helvetica-Bold" }}>{variance > 0 ? "+" : ""}{variance}d</Text>;
}

export function Pdf({ data, params, logo }: { data: StageProgressData; params: ReportParams; logo?: Buffer | string }) {
  const columns: Column<StageRow>[] = [
    {
      key: "number",
      label: "#",
      width: 6,
      align: "right",
      getText: (row) => String(row.stageNumber),
    },
    {
      key: "name",
      label: "Stage",
      width: 30,
      getText: (row) => row.stageName,
    },
    {
      key: "status",
      label: "Status",
      width: 12,
      align: "center",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "plannedStart",
      label: "Planned Start",
      width: 13,
      align: "center",
      getText: (row) => fmtDate(row.plannedStart),
    },
    {
      key: "plannedEnd",
      label: "Planned End",
      width: 13,
      align: "center",
      getText: (row) => fmtDate(row.plannedEnd),
    },
    {
      key: "actualStart",
      label: "Actual Start",
      width: 13,
      align: "center",
      getText: (row) => fmtDate(row.actualStart),
    },
    {
      key: "actualEnd",
      label: "Actual End",
      width: 13,
      align: "center",
      getText: (row) => fmtDate(row.actualEnd),
    },
    {
      key: "variance",
      label: "Variance",
      width: 10,
      align: "right",
      render: (row) => <VarianceBadge variance={row.daysVariance} />,
    },
  ];

  return (
    <ReportDocument
      title="Stage Progress Report"
      subtitle={`${data.projectName} — ${data.projectAddress}`}
      logo={logo}
      orientation="landscape"
    >
      {data.stages.length === 0 ? (
        <>
          <SectionHeading>Project Stages</SectionHeading>
          <Empty>No stages found for this project.</Empty>
        </>
      ) : (
        <>
          <SectionHeading>Exterior Track</SectionHeading>
          {data.exteriorStages.length === 0 ? (
            <Empty>No exterior stages.</Empty>
          ) : (
            <Table columns={columns} rows={data.exteriorStages} zebra={true} />
          )}

          <SectionHeading>Interior Track</SectionHeading>
          {data.interiorStages.length === 0 ? (
            <Empty>No interior stages.</Empty>
          ) : (
            <Table columns={columns} rows={data.interiorStages} zebra={true} />
          )}
        </>
      )}
    </ReportDocument>
  );
}
