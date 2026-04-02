"use client";

import { useState } from "react";
import GanttTab from "@/components/projects/tabs/GanttTab";
import StageReportTab from "@/components/projects/tabs/StageReportTab";
import CostItemsTab from "@/components/projects/tabs/CostItemsTab";
import BudgetTab from "@/components/projects/tabs/BudgetTab";
import PhasesTab from "@/components/projects/tabs/PhasesTab";
import SelectionsTab from "@/components/projects/tabs/SelectionsTab";
import FieldLogsTab from "@/components/projects/tabs/FieldLogsTab";
import DocumentsTab from "@/components/projects/tabs/DocumentsTab";

export interface BuildStage {
  id: string;
  stage_number: number;
  stage_name: string;
  track: string | null;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  notes: string | null;
}

export interface CostCode {
  id: string;
  pccId: string;
  budgeted_amount: number;
  code: string;
  name: string;
  category: string;
  sort_order: number | null;
}

export interface AvailableCostCode {
  id: string;
  code: string;
  name: string;
  category: string;
  sort_order: number | null;
}

export interface Phase {
  id: string;
  phase_number: number | null;
  name: string | null;
  size_acres: number | null;
  number_of_lots: number | null;
  lots_sold: number | null;
  status: string;
  notes: string | null;
}

export interface Document {
  id: string;
  folder: string;
  file_name: string;
  storage_path: string;
  file_size_kb: number | null;
  mime_type: string | null;
  created_at: string;
}

interface Props {
  projectId: string;
  isHome: boolean;
  startDate: string | null;
  buildStages: BuildStage[];
  costCodes: CostCode[];
  availableCostCodes: AvailableCostCode[];
  phases: Phase[];
  documents: Document[];
  committedByCostCodeId: Record<string, number>;
  actualByCostCodeId: Record<string, number>;
}

const HOME_TABS = [
  { id: "gantt",        label: "Gantt Chart" },
  { id: "stage-report", label: "Stage Report" },
  { id: "cost-items",   label: "Cost Items" },
  { id: "budget",       label: "Budget" },
  { id: "selections",   label: "Selections" },
  { id: "field-logs",   label: "Field Logs" },
  { id: "documents",    label: "Documents" },
] as const;

const LAND_TABS = [
  { id: "gantt",        label: "Gantt Chart" },
  { id: "stage-report", label: "Stage Report" },
  { id: "cost-items",   label: "Cost Items" },
  { id: "budget",       label: "Budget" },
  { id: "phases",       label: "Phases" },
  { id: "field-logs",   label: "Field Logs" },
  { id: "documents",    label: "Documents" },
] as const;

type HomeTabId = (typeof HOME_TABS)[number]["id"];
type LandTabId = (typeof LAND_TABS)[number]["id"];
type TabId = HomeTabId | LandTabId;

export default function ProjectTabs({
  projectId, isHome, startDate, buildStages, costCodes, availableCostCodes, phases, documents,
  committedByCostCodeId, actualByCostCodeId,
}: Props) {
  const tabs = isHome ? HOME_TABS : LAND_TABS;
  const [activeTab, setActiveTab] = useState<TabId>("gantt");

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Tab bar */}
      <div className="border-b border-gray-200 px-1 overflow-x-auto">
        <nav className="flex gap-0 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabId)}
              className={`px-4 py-3.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-[#4272EF] text-[#4272EF]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="p-5">
        {activeTab === "gantt" && (
          <GanttTab
            stages={buildStages}
            startDate={startDate}
            isHome={isHome}
          />
        )}
        {activeTab === "stage-report" && (
          <StageReportTab
            stages={buildStages}
            projectId={projectId}
            isHome={isHome}
            startDate={startDate}
          />
        )}
        {activeTab === "cost-items" && (
          <CostItemsTab
            projectId={projectId}
            isHome={isHome}
            costCodes={costCodes}
            availableCostCodes={availableCostCodes}
            phases={phases}
          />
        )}
        {activeTab === "budget" && (
          <BudgetTab
            costCodes={costCodes}
            committedByCostCodeId={committedByCostCodeId}
            actualByCostCodeId={actualByCostCodeId}
          />
        )}
        {activeTab === "phases" && !isHome && (
          <PhasesTab projectId={projectId} initialPhases={phases} />
        )}
        {activeTab === "selections" && isHome && <SelectionsTab projectId={projectId} />}
        {activeTab === "field-logs" && <FieldLogsTab projectId={projectId} />}
        {activeTab === "documents" && (
          <DocumentsTab projectId={projectId} initialDocuments={documents} />
        )}
      </div>
    </div>
  );
}
