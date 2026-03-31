"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, CreditCard, ChevronDown, ChevronRight } from "lucide-react";
import { createDraw, updateDrawStatus, deleteDraw } from "./actions";
import type { Database } from "@/types/database";

type Draw = Database["public"]["Tables"]["loan_draws"]["Row"] & {
  contacts?: { name: string } | null;
};
type ProjectRef = { id: string; name: string };
type LenderRef = { id: string; name: string };

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-700",
  funded: "bg-green-50 text-green-700",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

function NewDrawForm({
  projects,
  lenders,
  onDone,
}: {
  projects: ProjectRef[];
  lenders: LenderRef[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await createDraw(fd);
          onDone();
        });
      }}
      className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4"
    >
      <h3 className="font-semibold text-gray-900">New Draw Request</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          name="project_id"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">Select project *</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          name="lender_id"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">Select lender *</option>
          {lenders.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <input
          name="draw_number"
          type="number"
          min="1"
          required
          placeholder="Draw # *"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <input
          name="draw_date"
          type="date"
          required
          defaultValue={new Date().toISOString().split("T")[0]}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <input
          name="total_amount"
          type="number"
          min="0"
          step="0.01"
          required
          placeholder="Total amount ($) *"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <textarea
          name="notes"
          placeholder="Notes (optional)"
          rows={2}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none"
        />
      </div>
      <p className="text-xs text-gray-400 italic">
        Note: After creating the draw, go to AP &amp; Invoices to flag which invoices are included in this draw.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "#4272EF" }}
        >
          {isPending ? "Creating..." : "Create Draw"}
        </button>
      </div>
    </form>
  );
}

function DrawCard({
  draw,
  projects,
}: {
  draw: Draw;
  projects: ProjectRef[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const projectName = projects.find((p) => p.id === draw.project_id)?.name ?? "Unknown";
  const lenderName = draw.contacts?.name ?? "Unknown Lender";

  const nextStatus = draw.status === "draft" ? "submitted" : draw.status === "submitted" ? "funded" : null;
  const nextLabel = nextStatus === "submitted" ? "Mark Submitted" : nextStatus === "funded" ? "Mark Funded" : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div
        className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-xl"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-gray-400 shrink-0">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">Draw #{draw.draw_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[draw.status] ?? ""}`}>
              {draw.status}
            </span>
            <span className="text-sm text-gray-500">{projectName}</span>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-0.5">
            <span>{lenderName}</span>
            <span>{draw.draw_date}</span>
            <span className="font-medium text-gray-900">{fmt(draw.total_amount)}</span>
          </div>
        </div>
        {nextLabel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              startTransition(async () => {
                if (confirm(`${nextLabel}?`)) await updateDrawStatus(draw.id, nextStatus!);
              });
            }}
            className="shrink-0 text-xs text-white px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: "#4272EF" }}
          >
            {nextLabel}
          </button>
        )}
      </div>

      {expanded && draw.notes && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          <p className="text-sm text-gray-600">{draw.notes}</p>
        </div>
      )}
    </div>
  );
}

export default function DrawsClient({
  draws,
  projects,
  lenders,
}: {
  draws: Draw[];
  projects: ProjectRef[];
  lenders: LenderRef[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");

  const filtered = filterStatus ? draws.filter((d) => d.status === filterStatus) : draws;

  const totalFunded = draws.filter((d) => d.status === "funded").reduce((s, d) => s + d.total_amount, 0);
  const totalPending = draws.filter((d) => d.status !== "funded").reduce((s, d) => s + d.total_amount, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Draws</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{draws.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Funded</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{fmt(totalFunded)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Pending / Draft</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totalPending)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {["", "draft", "submitted", "funded"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filterStatus === s ? "text-white border-transparent" : "text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
              style={filterStatus === s ? { backgroundColor: "#4272EF" } : undefined}
            >
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          {lenders.length === 0 ? (
            <p className="text-xs text-gray-400">Add a lender contact first.</p>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
              style={{ backgroundColor: "#4272EF" }}
            >
              <Plus size={15} /> New Draw Request
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <NewDrawForm projects={projects} lenders={lenders} onDone={() => setShowAdd(false)} />
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center">
          <CreditCard size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No draws yet. Add a lender in Contacts first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((draw) => (
            <DrawCard key={draw.id} draw={draw} projects={projects} />
          ))}
        </div>
      )}
    </div>
  );
}
