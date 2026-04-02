"use client";

import { useState, useTransition } from "react";
import {
  Plus, Trash2, CheckCircle2, Circle, Pencil, DollarSign,
  ChevronDown, ChevronRight,
} from "lucide-react";
import {
  createStage, deleteStage,
  createCostItem, deleteCostItem,
  createMilestone, toggleMilestone, deleteMilestone,
  createSale, settleSale, deleteSale,
  upsertBuildStage,
  createSelection, updateSelectionStatus, deleteSelection,
  createProjectFieldLog, createProjectFieldTodo, updateProjectTodoStatus,
} from "./actions";
import type { Database } from "@/types/database";

type Project = Database["public"]["Tables"]["projects"]["Row"];
type Stage = Database["public"]["Tables"]["stages"]["Row"];
type CostItem = Database["public"]["Tables"]["cost_items"]["Row"];
type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Sale = Database["public"]["Tables"]["sales"]["Row"];
type BuildStage = Database["public"]["Tables"]["build_stages"]["Row"];
type FieldLog = Database["public"]["Tables"]["field_logs"]["Row"];
type FieldTodo = Database["public"]["Tables"]["field_todos"]["Row"];
type Selection = Database["public"]["Tables"]["selections"]["Row"];

const COST_CATEGORIES = [
  "land","siteworks","foundation","framing","roofing","electrical","plumbing",
  "hvac","insulation","drywall","flooring","cabinetry","painting","landscaping",
  "permits","professional_fees","contingency","other",
];

const STAGE_STATUSES = ["not_started","in_progress","completed","blocked"] as const;
const SALE_TYPES = ["lot_sale","house_sale","progress_payment","deposit","variation","other"] as const;

const BUILD_STAGE_STATUSES = ["not_started","in_progress","complete","delayed"] as const;

const SELECTION_CATEGORIES = [
  "Flooring","Countertops","Cabinets","Paint","Tile","Appliances","Fixtures",
  "Doors & Hardware","Windows","Exterior",
];

const SELECTION_STATUSES = ["pending","selected","ordered","delivered","installed"] as const;

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  complete: "bg-green-50 text-green-700",
  blocked: "bg-red-50 text-red-600",
  delayed: "bg-amber-50 text-amber-700",
};

const SELECTION_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  selected: "bg-blue-50 text-blue-700",
  ordered: "bg-purple-50 text-purple-700",
  delivered: "bg-amber-50 text-amber-700",
  installed: "bg-green-50 text-green-700",
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-600",
  active: "bg-green-50 text-green-700",
  on_hold: "bg-amber-50 text-amber-700",
  completed: "bg-blue-50 text-blue-700",
  cancelled: "bg-red-50 text-red-600",
};

const PRIORITY_COLORS = {
  low: "bg-gray-100 text-gray-500",
  normal: "bg-blue-50 text-blue-700",
  urgent: "bg-red-50 text-red-700",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

// ---- Inline forms ----

function AddStageForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { await createStage(projectId, fd); onDone(); }); }} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="name" required placeholder="Stage name *" className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <select name="status" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
          {STAGE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <input name="budget" type="number" min="0" step="100" placeholder="Budget ($)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <input name="start_date" type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <input name="end_date" type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>{isPending ? "Adding..." : "Add Stage"}</button>
      </div>
    </form>
  );
}

function AddCostItemForm({ projectId, stages, onDone }: { projectId: string; stages: Stage[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { await createCostItem(projectId, fd); onDone(); }); }} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="description" required placeholder="Description *" className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <select name="category" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
          {COST_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <select name="stage_id" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
          <option value="">No stage</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input name="budgeted_amount" type="number" min="0" step="100" placeholder="Budgeted ($)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <input name="actual_amount" type="number" min="0" step="100" placeholder="Actual ($)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <input name="vendor" placeholder="Vendor (optional)" className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>{isPending ? "Adding..." : "Add Cost Item"}</button>
      </div>
    </form>
  );
}

function AddMilestoneForm({ projectId, stages, onDone }: { projectId: string; stages: Stage[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { await createMilestone(projectId, fd); onDone(); }); }} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="name" required placeholder="Milestone name *" className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <input name="due_date" type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <select name="stage_id" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
          <option value="">No stage</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>{isPending ? "Adding..." : "Add Milestone"}</button>
      </div>
    </form>
  );
}

function AddSaleForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { await createSale(projectId, fd); onDone(); }); }} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="description" required placeholder="Description *" className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <select name="sale_type" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
          {SALE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <input name="buyer_name" placeholder="Buyer name" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <input name="contract_price" type="number" min="0" step="1000" placeholder="Contract price ($)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <input name="deposit_amount" type="number" min="0" step="1000" placeholder="Deposit ($)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-500 mb-1">Deposit received</label>
            <input name="deposit_received_date" type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Settlement date</label>
            <input name="settlement_date" type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" /></div>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>{isPending ? "Adding..." : "Add Sale"}</button>
      </div>
    </form>
  );
}

function SettleForm({ projectId, sale, onDone }: { projectId: string; sale: Sale; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { await settleSale(projectId, sale.id, fd); onDone(); }); }} className="flex items-center gap-2 mt-2">
      <input name="settled_amount" type="number" min="0" step="1000" placeholder="Settled amount ($)" defaultValue={sale.contract_price ?? ""} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
      <input name="settled_date" type="date" defaultValue={new Date().toISOString().split("T")[0]} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
      <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">{isPending ? "..." : "Settle"}</button>
      <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600">Cancel</button>
    </form>
  );
}

function AddSelectionForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { await createSelection(projectId, fd); onDone(); }); }} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select name="category" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
          <option value="">Category *</option>
          {SELECTION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input name="item_name" required placeholder="Item name *" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
        <select name="status" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
          {SELECTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input name="notes" placeholder="Notes (optional)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>{isPending ? "Adding..." : "Add Item"}</button>
      </div>
    </form>
  );
}

function AddFieldLogForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { await createProjectFieldLog(projectId, fd); onDone(); }); }} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <input name="log_date" type="date" required defaultValue={new Date().toISOString().split("T")[0]} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
      <textarea name="notes" required placeholder="Field observations, work performed, issues... *" rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none" />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>{isPending ? "Saving..." : "Save Log"}</button>
      </div>
    </form>
  );
}

function BuildStageRow({ projectId, masterStage, buildStage }: {
  projectId: string;
  masterStage: { number: number; name: string };
  buildStage: BuildStage | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const status = buildStage?.status ?? "not_started";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono text-gray-400 shrink-0 w-6 text-right">{masterStage.number}</span>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600"}`}>
            {status.replace(/_/g, " ")}
          </span>
          <span className="font-medium text-gray-900 truncate text-sm">{masterStage.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {buildStage?.planned_start_date && (
            <span className="text-xs text-gray-400 hidden sm:block">
              {buildStage.planned_start_date} → {buildStage.planned_end_date ?? "?"}
            </span>
          )}
          <button onClick={() => setEditing(!editing)} className="text-gray-400 hover:text-gray-600">
            <Pencil size={14} />
          </button>
        </div>
      </div>
      {buildStage?.notes && <p className="text-xs text-gray-400 mt-1 ml-9">{buildStage.notes}</p>}
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              await upsertBuildStage(projectId, masterStage.number, masterStage.name, {
                status: fd.get("status") as string,
                planned_start_date: (fd.get("planned_start_date") as string) || null,
                planned_end_date: (fd.get("planned_end_date") as string) || null,
                actual_start_date: (fd.get("actual_start_date") as string) || null,
                actual_end_date: (fd.get("actual_end_date") as string) || null,
                notes: (fd.get("notes") as string) || null,
              });
              setEditing(false);
            });
          }}
          className="mt-3 ml-9 grid grid-cols-2 sm:grid-cols-3 gap-2"
        >
          <select name="status" defaultValue={buildStage?.status ?? "not_started"} className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
            {BUILD_STAGE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <div className="col-span-2 sm:col-span-1 text-xs text-gray-400 self-center hidden">—</div>
          <div><label className="text-xs text-gray-400 block">Plan Start</label>
            <input name="planned_start_date" type="date" defaultValue={buildStage?.planned_start_date ?? ""} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" /></div>
          <div><label className="text-xs text-gray-400 block">Plan End</label>
            <input name="planned_end_date" type="date" defaultValue={buildStage?.planned_end_date ?? ""} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" /></div>
          <div><label className="text-xs text-gray-400 block">Actual Start</label>
            <input name="actual_start_date" type="date" defaultValue={buildStage?.actual_start_date ?? ""} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" /></div>
          <div><label className="text-xs text-gray-400 block">Actual End</label>
            <input name="actual_end_date" type="date" defaultValue={buildStage?.actual_end_date ?? ""} className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" /></div>
          <input name="notes" defaultValue={buildStage?.notes ?? ""} placeholder="Notes" className="col-span-2 sm:col-span-3 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" />
          <div className="col-span-2 sm:col-span-3 flex gap-2 justify-end">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isPending} className="px-3 py-1 text-xs text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>{isPending ? "..." : "Save"}</button>
          </div>
        </form>
      )}
    </div>
  );
}

// Master list of all 54 build stages
const MASTER_BUILD_STAGES = [
  { number: 1, name: "Lot prep and layout" },
  { number: 2, name: "Pad grading" },
  { number: 3, name: "Temp utilities & site setup" },
  { number: 4, name: "Foundation - Set forms & Trench" },
  { number: 5, name: "Plumbing - Underground" },
  { number: 6, name: "Electrical - Underground (ENT)" },
  { number: 7, name: "Foundation (cables/rebar)" },
  { number: 8, name: "Pour slab" },
  { number: 9, name: "Construction Clean - 1/7 - Forms" },
  { number: 10, name: "Rough grade" },
  { number: 11, name: "Framing – walls & trusses" },
  { number: 12, name: "Sheathing – walls and roof" },
  { number: 13, name: "Weather barrier (WRB)" },
  { number: 14, name: "Windows and exterior doors" },
  { number: 15, name: "Water Well Install" },
  { number: 16, name: "Plumbing - Top‑Out" },
  { number: 17, name: "HVAC - Rough" },
  { number: 18, name: "Roofing" },
  { number: 19, name: "Electrical - Rough" },
  { number: 20, name: "Construction Clean - 2/7 - Frame" },
  { number: 21, name: "Siding – exterior cladding" },
  { number: 22, name: "Insulation" },
  { number: 23, name: "Drywall – hang, tape, texture" },
  { number: 24, name: "Construction Clean - 3/7 - Drywall" },
  { number: 25, name: "Garage door - Rough (door and tracks)" },
  { number: 26, name: "Paint - Exterior" },
  { number: 27, name: "Masonry/brick/stone" },
  { number: 28, name: "Construction Clean - 4/7 - Brick" },
  { number: 29, name: "Septic system rough in" },
  { number: 30, name: "Interior doors & trim" },
  { number: 31, name: "Cabinets" },
  { number: 32, name: "Construction Clean - 5/7 - Trim" },
  { number: 33, name: "Paint - interior" },
  { number: 34, name: "Countertops" },
  { number: 35, name: "Fireplace" },
  { number: 36, name: "Construction Clean - 6/7 - Paint & Tile" },
  { number: 37, name: "Flatwork – driveway, walks, patios" },
  { number: 38, name: "Flooring Install" },
  { number: 39, name: "Tile" },
  { number: 40, name: "Electrical - Final" },
  { number: 41, name: "Plumbing - Final" },
  { number: 42, name: "HVAC - Final" },
  { number: 43, name: "Hardware" },
  { number: 44, name: "Garage door - Final (operator/opener)" },
  { number: 45, name: "Appliances" },
  { number: 46, name: "Mirrors/Glass" },
  { number: 47, name: "Paint - interior finish & touch‑ups" },
  { number: 48, name: "Gutter install" },
  { number: 49, name: "Final grade" },
  { number: 50, name: "Landscape/irrigation" },
  { number: 51, name: "Construction Clean - 7/7 - Final" },
  { number: 52, name: "Punch list & touch‑ups" },
  { number: 53, name: "Final Clean" },
  { number: 54, name: "Final inspections & utility releases" },
];

// ---- Tabs ----

type Tab = "build_stages" | "stages" | "costs" | "milestones" | "sales" | "field_logs" | "selections";

const TABS: { id: Tab; label: string }[] = [
  { id: "build_stages", label: "Build Stages" },
  { id: "stages", label: "Project Stages" },
  { id: "costs", label: "Cost Items" },
  { id: "milestones", label: "Milestones" },
  { id: "sales", label: "Sales" },
  { id: "field_logs", label: "Field Logs" },
  { id: "selections", label: "Selections" },
];

// ---- Main component ----

export default function ProjectDetailClient({
  project, stages, costItems, milestones, sales, buildStages, fieldLogs, fieldTodos, selections,
}: {
  project: Project;
  stages: Stage[];
  costItems: CostItem[];
  milestones: Milestone[];
  sales: Sale[];
  buildStages: BuildStage[];
  fieldLogs: FieldLog[];
  fieldTodos: FieldTodo[];
  selections: Selection[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("build_stages");
  const [showAdd, setShowAdd] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [showAddTodoForLog, setShowAddTodoForLog] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const totalBudgeted = costItems.reduce((s, c) => s + c.budgeted_amount, 0);
  const totalActual = costItems.reduce((s, c) => s + c.actual_amount, 0);
  const totalRevenue = sales.filter(s => s.is_settled).reduce((s, sale) => s + (sale.settled_amount ?? 0), 0);
  const variance = totalBudgeted - totalActual;

  const buildStageByNumber = Object.fromEntries(buildStages.map(s => [s.stage_number, s]));
  const completedBuildStages = buildStages.filter(s => s.status === "complete").length;

  // Group selections by category
  const selectionsByCategory = SELECTION_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = selections.filter(s => s.category === cat);
    return acc;
  }, {} as Record<string, Selection[]>);

  function getAddLabel() {
    switch (activeTab) {
      case "stages": return "Stage";
      case "costs": return "Cost Item";
      case "milestones": return "Milestone";
      case "sales": return "Sale";
      case "field_logs": return "Log";
      case "selections": return "Item";
      default: return null;
    }
  }

  const addLabel = getAddLabel();

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Project summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PROJECT_STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-600"}`}>
                {project.status.replace("_", " ")}
              </span>
              {project.subdivision && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{project.subdivision}</span>
              )}
            </div>
            {project.address && <p className="text-sm text-gray-500">{project.address}</p>}
            {project.description && <p className="text-sm text-gray-600 mt-1">{project.description}</p>}
          </div>
          <a href={`/projects/${project.id}/edit`} className="shrink-0 flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
            <Pencil size={14} /> Edit
          </a>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Total Budget</p>
            <p className="font-semibold text-gray-900">{fmt(project.total_budget)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Actual Spend</p>
            <p className="font-semibold text-gray-900">{fmt(totalActual)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Variance</p>
            <p className={`font-semibold ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
              {variance >= 0 ? "+" : ""}{fmt(variance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Settled Revenue</p>
            <p className="font-semibold text-gray-900">{fmt(totalRevenue)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Build Progress</p>
            <p className="font-semibold text-gray-900">{completedBuildStages}/54</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex flex-wrap items-end border-b border-gray-200 gap-x-1 mb-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setShowAdd(false); }}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-[#4272EF] text-[#4272EF]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {tab.id === "costs" && costItems.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{costItems.length}</span>
              )}
              {tab.id === "milestones" && milestones.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{milestones.filter(m => !m.is_completed).length}/{milestones.length}</span>
              )}
              {tab.id === "build_stages" && completedBuildStages > 0 && (
                <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">{completedBuildStages}</span>
              )}
              {tab.id === "field_logs" && fieldLogs.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{fieldLogs.length}</span>
              )}
              {tab.id === "selections" && selections.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{selections.length}</span>
              )}
            </button>
          ))}
          {addLabel && (
            <div className="ml-auto pb-1 flex items-end">
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 text-sm font-medium pb-1"
                style={{ color: "#4272EF" }}
              >
                <Plus size={15} /> Add {addLabel}
              </button>
            </div>
          )}
        </div>

        {/* Build Stages Tab */}
        {activeTab === "build_stages" && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-3">54-stage master build tracker. Click the pencil to update status and dates for each stage.</p>
            {MASTER_BUILD_STAGES.map((ms) => (
              <BuildStageRow
                key={ms.number}
                projectId={project.id}
                masterStage={ms}
                buildStage={buildStageByNumber[ms.number]}
              />
            ))}
          </div>
        )}

        {/* Project Stages Tab */}
        {activeTab === "stages" && (
          <div className="space-y-3">
            {showAdd && <AddStageForm projectId={project.id} onDone={() => setShowAdd(false)} />}
            {stages.length === 0 && !showAdd ? (
              <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">No custom stages yet.</p>
            ) : stages.map((stage) => {
              const stageItems = costItems.filter(c => c.stage_id === stage.id);
              const stageActual = stageItems.reduce((s, c) => s + c.actual_amount, 0);
              return (
                <div key={stage.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[stage.status]}`}>
                        {stage.status.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium text-gray-900 truncate">{stage.name}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-sm text-gray-500">{fmt(stageActual)} / {fmt(stage.budget)}</span>
                      <button onClick={() => startTransition(async () => { if (confirm("Delete this stage?")) await deleteStage(project.id, stage.id); })} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {(stage.start_date || stage.end_date) && (
                    <p className="text-xs text-gray-400 mt-1">{stage.start_date ?? "—"} → {stage.end_date ?? "—"}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Cost Items Tab */}
        {activeTab === "costs" && (
          <div className="space-y-3">
            {showAdd && <AddCostItemForm projectId={project.id} stages={stages} onDone={() => setShowAdd(false)} />}
            {costItems.length === 0 && !showAdd ? (
              <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">No cost items yet.</p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Stage</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Budgeted</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actual</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {costItems.map((item) => {
                      const stage = stages.find(s => s.id === item.stage_id);
                      const over = item.actual_amount > item.budgeted_amount;
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-900">{item.description}</td>
                          <td className="px-4 py-3 text-gray-500 capitalize text-xs">{item.category.replace(/_/g, " ")}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{stage?.name ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(item.budgeted_amount)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${over ? "text-red-600" : "text-gray-700"}`}>{fmt(item.actual_amount)}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => startTransition(async () => { if (confirm("Delete?")) await deleteCostItem(project.id, item.id); })} className="text-gray-300 hover:text-red-500 transition-colors">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Milestones Tab */}
        {activeTab === "milestones" && (
          <div className="space-y-3">
            {showAdd && <AddMilestoneForm projectId={project.id} stages={stages} onDone={() => setShowAdd(false)} />}
            {milestones.length === 0 && !showAdd ? (
              <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">No milestones yet.</p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
                {milestones.map((m) => {
                  const stage = stages.find(s => s.id === m.stage_id);
                  const isOverdue = !m.is_completed && m.due_date && m.due_date < new Date().toISOString().split("T")[0];
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => startTransition(async () => { await toggleMilestone(project.id, m.id, !m.is_completed); })} className={m.is_completed ? "text-green-500" : "text-gray-300 hover:text-gray-400"}>
                        {m.is_completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${m.is_completed ? "line-through text-gray-400" : "text-gray-900"}`}>{m.name}</span>
                        {stage && <span className="ml-2 text-xs text-gray-400">{stage.name}</span>}
                      </div>
                      {m.due_date && <span className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-gray-400"}`}>{m.due_date}</span>}
                      <button onClick={() => startTransition(async () => { if (confirm("Delete?")) await deleteMilestone(project.id, m.id); })} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sales Tab */}
        {activeTab === "sales" && (
          <div className="space-y-3">
            {showAdd && <AddSaleForm projectId={project.id} onDone={() => setShowAdd(false)} />}
            {sales.length === 0 && !showAdd ? (
              <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">No sales recorded yet.</p>
            ) : sales.map((sale) => (
              <div key={sale.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{sale.description}</span>
                      <span className="text-xs text-gray-400 capitalize">{sale.sale_type.replace(/_/g, " ")}</span>
                      {sale.is_settled ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <DollarSign size={10} /> Settled
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>
                      )}
                    </div>
                    {sale.buyer_name && <p className="text-sm text-gray-500">Buyer: {sale.buyer_name}</p>}
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      {sale.contract_price && <span>Contract: {fmt(sale.contract_price)}</span>}
                      {sale.deposit_amount && <span>Deposit: {fmt(sale.deposit_amount)}</span>}
                      {sale.is_settled && sale.settled_amount && <span className="text-green-700 font-medium">Settled: {fmt(sale.settled_amount)}</span>}
                      {sale.settlement_date && <span>Settlement: {sale.settlement_date}</span>}
                    </div>
                    {!sale.is_settled && settlingId === sale.id && (
                      <SettleForm projectId={project.id} sale={sale} onDone={() => setSettlingId(null)} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!sale.is_settled && settlingId !== sale.id && (
                      <button onClick={() => setSettlingId(sale.id)} className="text-xs text-green-600 hover:text-green-700 border border-green-200 px-2 py-1 rounded-lg">Settle</button>
                    )}
                    <button onClick={() => startTransition(async () => { if (confirm("Delete?")) await deleteSale(project.id, sale.id); })} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Field Logs Tab */}
        {activeTab === "field_logs" && (
          <div className="space-y-3">
            {showAdd && <AddFieldLogForm projectId={project.id} onDone={() => setShowAdd(false)} />}
            {fieldLogs.length === 0 && !showAdd ? (
              <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">No field logs yet.</p>
            ) : fieldLogs.map((log) => {
              const logTodos = fieldTodos.filter(t => t.field_log_id === log.id);
              const isExpanded = expandedLogId === log.id;
              return (
                <div key={log.id} className="bg-white rounded-xl border border-gray-200">
                  <button
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors rounded-xl"
                  >
                    <span className="text-gray-400 mt-0.5 shrink-0">
                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-gray-900 text-sm">{log.log_date}</span>
                        {logTodos.length > 0 && (
                          <span className="text-xs text-gray-400">{logTodos.filter(t => t.status !== "done").length} open to-dos</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2">{log.notes}</p>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.notes}</p>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To-Dos</span>
                          <button onClick={() => setShowAddTodoForLog(showAddTodoForLog === log.id ? null : log.id)} className="text-xs flex items-center gap-1 font-medium" style={{ color: "#4272EF" }}>
                            <Plus size={12} /> Add
                          </button>
                        </div>
                        {showAddTodoForLog === log.id && (
                          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(async () => { await createProjectFieldTodo(project.id, log.id, fd); setShowAddTodoForLog(null); }); }} className="flex flex-wrap gap-2 mb-2 p-2 bg-gray-50 rounded-lg">
                            <input name="description" required placeholder="To-do *" className="flex-1 min-w-32 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" />
                            <select name="priority" className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none">
                              <option value="normal">Normal</option>
                              <option value="urgent">Urgent</option>
                              <option value="low">Low</option>
                            </select>
                            <input name="due_date" type="date" className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" />
                            <button type="submit" className="px-2 py-1 text-xs text-white rounded" style={{ backgroundColor: "#4272EF" }}>Add</button>
                            <button type="button" onClick={() => setShowAddTodoForLog(null)} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          </form>
                        )}
                        {logTodos.length === 0 ? (
                          <p className="text-xs text-gray-400">No to-dos for this log.</p>
                        ) : logTodos.map((todo) => (
                          <div key={todo.id} className="flex items-center gap-2 py-1">
                            <button onClick={() => startTransition(async () => { const next = todo.status === "done" ? "open" : todo.status === "open" ? "in_progress" : "done"; await updateProjectTodoStatus(project.id, todo.id, next); })} className="shrink-0">
                              {todo.status === "done" ? <CheckCircle2 size={15} className="text-green-500" /> : todo.status === "in_progress" ? <Circle size={15} className="text-blue-500" /> : <Circle size={15} className="text-gray-300" />}
                            </button>
                            <span className={`flex-1 text-sm ${todo.status === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>{todo.description}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[todo.priority as keyof typeof PRIORITY_COLORS] ?? ""}`}>{todo.priority}</span>
                            {todo.due_date && <span className="text-xs text-gray-400">{todo.due_date}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Selections Tab */}
        {activeTab === "selections" && (
          <div className="space-y-4">
            {showAdd && <AddSelectionForm projectId={project.id} onDone={() => setShowAdd(false)} />}
            {SELECTION_CATEGORIES.map((cat) => {
              const items = selectionsByCategory[cat] ?? [];
              if (items.length === 0 && !showAdd) return null;
              return (
                <div key={cat}>
                  <h3 className="font-semibold text-gray-700 text-sm mb-2">{cat}</h3>
                  {items.length === 0 ? (
                    <p className="text-xs text-gray-400 ml-2">No items yet.</p>
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
                      {items.map((sel) => (
                        <div key={sel.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex-1 text-sm font-medium text-gray-900">{sel.item_name}</span>
                          {sel.notes && <span className="text-xs text-gray-400">{sel.notes}</span>}
                          <select
                            value={sel.status}
                            onChange={(e) => startTransition(async () => { await updateSelectionStatus(project.id, sel.id, e.target.value); })}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
                          >
                            {SELECTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${SELECTION_STATUS_COLORS[sel.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {sel.status}
                          </span>
                          <button onClick={() => startTransition(async () => { if (confirm("Delete?")) await deleteSelection(project.id, sel.id); })} className="text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {selections.length === 0 && !showAdd && (
              <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">No selections yet. Click &ldquo;Add Item&rdquo; to start.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
