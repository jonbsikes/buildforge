import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtDate,
  fmtNumber,
  Table,
  Column,
  SectionHeading,
  Empty,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stage {
  stage_number: number;
  stage_name: string;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

export interface GanttData {
  projectName: string;
  projectAddress: string;
  stages: Stage[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<GanttData> {
  const supabase = await createClient();
  const projectId = p.projectId!;

  // Fetch project
  const { data: proj } = await supabase
    .from("projects")
    .select("name, address")
    .eq("id", projectId)
    .single();

  // Fetch stages
  const { data: stagesData } = await supabase
    .from("build_stages")
    .select(
      "stage_number, stage_name, status, planned_start_date, planned_end_date, actual_start_date, actual_end_date"
    )
    .eq("project_id", projectId)
    .order("stage_number");

  return {
    projectName: proj?.name ?? "—",
    projectAddress: proj?.address ?? "—",
    stages: stagesData ?? [],
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

const stageCols: Column<Stage>[] = [
  { key: "number", label: "#", width: 8, align: "center", render: (s) => fmtNumber(s.stage_number) },
  { key: "name", label: "Stage", width: 35, render: (s) => s.stage_name },
  { key: "start", label: "Start", width: 15, align: "right", render: (s) => {
    const date = s.actual_start_date || s.planned_start_date;
    return fmtDate(date);
  }},
  { key: "end", label: "End", width: 15, align: "right", render: (s) => {
    const date = s.actual_end_date || s.planned_end_date;
    return fmtDate(date);
  }},
  { key: "status", label: "Status", width: 27, align: "right", render: (s) => {
    const statusColor =
      s.status === "not_started"
        ? colors.muted
        : s.status === "in_progress"
        ? colors.brand
        : s.status === "complete"
        ? colors.green
        : colors.red;
    return <Text style={{ color: statusColor, fontFamily: "Helvetica-Bold" }}>{s.status.replace(/_/g, " ")}</Text>;
  }},
];

export function Pdf({ data, params, logo }: { data: GanttData; params: ReportParams; logo?: string }) {
  return (
    <ReportDocument
      title="Gantt Schedule"
      subtitle={`${data.projectName} • ${data.projectAddress}`}
      logo={logo}
      orientation="landscape"
    >
      <SectionHeading>Build Stages Timeline</SectionHeading>
      {data.stages.length === 0 ? (
        <Empty>No build stages for this project.</Empty>
      ) : (
        <Table columns={stageCols} rows={data.stages} />
      )}
    </ReportDocument>
  );
}
