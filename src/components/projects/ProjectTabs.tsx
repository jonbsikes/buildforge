"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  DollarSign, BarChart3, ClipboardList, Palette, FileText, FolderOpen, LayoutGrid, Layers,
} from "lucide-react";
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
  /** Counts shown on relevant tabs (per UI Review § 05 #30). */
  fieldLogsCount?: number;
  selectionsPendingCount?: number;
}

const TAB_ICONS: Record<string, React.ElementType> = {
  "cost-items":   DollarSign,
  "gantt":        BarChart3,
  "stage-report": ClipboardList,
  "budget":       LayoutGrid,
  "phases":       Layers,
  "selections":   Palette,
  "field-logs":   FileText,
  "documents":    FolderOpen,
};

const HOME_TABS = [
  { id: "stage-report", label: "Stages" },
  { id: "cost-items",   label: "Job Costs" },
  { id: "budget",       label: "Budget" },
  { id: "gantt",        label: "Gantt" },
  { id: "field-logs",   label: "Logs" },
  { id: "selections",   label: "Selections" },
  { id: "documents",    label: "Docs" },
] as const;

const LAND_TABS = [
  { id: "stage-report", label: "Stages" },
  { id: "cost-items",   label: "Job Costs" },
  { id: "budget",       label: "Budget" },
  { id: "gantt",        label: "Gantt" },
  { id: "field-logs",   label: "Logs" },
  { id: "phases",       label: "Phases" },
  { id: "documents",    label: "Docs" },
] as const;

type HomeTabId = (typeof HOME_TABS)[number]["id"];
type LandTabId = (typeof LAND_TABS)[number]["id"];
type TabId = HomeTabId | LandTabId;

export default function ProjectTabs({
  projectId, isHome, startDate, buildStages, costCodes, availableCostCodes, phases, documents,
  committedByCostCodeId, actualByCostCodeId, fieldLogsCount, selectionsPendingCount,
}: Props) {
  void committedByCostCodeId;
  const tabs = isHome ? HOME_TABS : LAND_TABS;

  // Per UI Review § 05 #30: counts and delayed-badge on tabs add a relevance signal.
  const today = new Date().toISOString().split("T")[0]!;
  const delayedCount = buildStages.filter(
    (s) => s.status !== "complete" && s.status !== "completed" && s.status !== "skipped" &&
      s.planned_end_date && s.planned_end_date < today
  ).length;
  const counts: Record<string, { count?: number; delayed?: boolean }> = {
    "stage-report": { count: buildStages.length, delayed: delayedCount > 0 },
    "cost-items": { count: costCodes.length },
    "documents": { count: documents.length },
    "phases": { count: phases.length },
    "field-logs": { count: fieldLogsCount },
    "selections": { count: selectionsPendingCount },
  };
  const [activeTab, setActiveTab] = useState<TabId>("stage-report");
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const scrollActiveIntoView = useCallback(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      const scrollLeft = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollActiveIntoView();
  }, [activeTab, scrollActiveIntoView]);

  return (
    <div>
      {/* Mobile pill tabs */}
      <div
        ref={scrollRef}
        className="lg:hidden flex gap-2 px-1 pb-3 overflow-x-auto no-scrollbar snap-x snap-mandatory"
      >
        {tabs.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const isActive = activeTab === tab.id;
          const meta = counts[tab.id];
          const showCount = meta?.count !== undefined && meta.count > 0;
          return (
            <button
              key={tab.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => setActiveTab(tab.id as TabId)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap snap-center transition-all ${
                isActive
                  ? "bg-[#4272EF] text-white"
                  : meta?.count === 0
                    ? "bg-white text-gray-400 border border-gray-200 active:bg-gray-100"
                    : "bg-white text-gray-600 border border-gray-200 active:bg-gray-100"
              }`}
            >
              {Icon && <Icon size={15} />}
              {tab.label}
              {showCount && (
                <span className={`tabular-nums text-[10px] ${isActive ? "text-white/80" : "text-gray-400"}`}>
                  {meta!.count}
                </span>
              )}
              {meta?.delayed && !isActive && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--status-delayed)" }}
                  title={`${delayedCount} delayed`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Desktop underline tabs */}
      <div className="hidden lg:block bg-white rounded-t-xl border border-b-0 border-gray-200">
        <div className="px-2 overflow-x-auto">
          <nav className="flex gap-0 min-w-max">
            {tabs.map((tab) => {
              const Icon = TAB_ICONS[tab.id];
              const isActive = activeTab === tab.id;
              const meta = counts[tab.id];
              const showCount = meta?.count !== undefined && meta.count > 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabId)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                    isActive
                      ? "border-[#4272EF] text-[#4272EF]"
                      : meta?.count === 0
                        ? "border-transparent text-gray-300 hover:text-gray-500 hover:border-gray-200"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {Icon && <Icon size={15} />}
                  {tab.label}
                  {showCount && (
                    <span className={`tabular-nums text-[11px] ${isActive ? "text-[#4272EF]/80" : "text-gray-400"}`}>
                      {meta!.count}
                    </span>
                  )}
                  {meta?.delayed && !isActive && (
                    <span
                      className="ml-1 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "var(--status-delayed)" }}
                      title={`${delayedCount} delayed`}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl lg:rounded-t-none border border-gray-200 lg:border-t-0 p-4 lg:p-6">
        {activeTab === "gantt" && (
          <GanttTab stages={buildStages} startDate={startDate} isHome={isHome} />
        )}
        {activeTab === "stage-report" && (
          <StageReportTab stages={buildStages} projectId={projectId} isHome={isHome} startDate={startDate} />
        )}
        {activeTab === "cost-items" && (
          <CostItemsTab projectId={projectId} isHome={isHome} costCodes={costCodes} availableCostCodes={availableCostCodes} phases={phases} actualByCostCodeId={actualByCostCodeId} />
        )}
        {activeTab === "budget" && (
          <BudgetTab projectId={projectId} costCodes={costCodes} />
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
