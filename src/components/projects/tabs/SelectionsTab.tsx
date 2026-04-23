"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Plus, Trash2, Loader2, ChevronRight, Palette } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createSelection,
  updateSelectionStatus,
  deleteSelection,
} from "@/app/actions/projects";

interface Selection {
  id: string;
  category: string;
  item_name: string;
  status: string;
  notes: string | null;
}

const CATEGORIES = [
  "Flooring", "Countertops", "Cabinets", "Paint", "Tile",
  "Appliances", "Fixtures", "Doors & Hardware", "Windows", "Exterior",
];

const STATUS_ORDER = ["pending", "confirmed", "ordered", "installed"];

const STATUS_CONFIG: Record<string, { bg: string; text: string; activeBg: string; border: string; dot: string }> = {
  pending:   { bg: "bg-gray-50",    text: "text-gray-600",   activeBg: "active:bg-gray-100",   border: "border-gray-200", dot: "bg-gray-400" },
  confirmed: { bg: "bg-blue-50",    text: "text-blue-700",   activeBg: "active:bg-blue-100",   border: "border-blue-200", dot: "bg-blue-500" },
  ordered:   { bg: "bg-purple-50",  text: "text-purple-700", activeBg: "active:bg-purple-100", border: "border-purple-200", dot: "bg-purple-500" },
  installed: { bg: "bg-green-50",   text: "text-green-700",  activeBg: "active:bg-green-100",  border: "border-green-200", dot: "bg-green-500" },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  ordered: "Ordered",
  installed: "Installed",
};

function StatusStepper({ selectionId, status, projectId, onChange }: {
  selectionId: string; status: string; projectId: string; onChange: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function advance() {
    const idx = STATUS_ORDER.indexOf(status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length] ?? "pending";
    startTransition(async () => {
      await updateSelectionStatus(projectId, selectionId, next);
      onChange();
    });
  }

  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const currentIdx = STATUS_ORDER.indexOf(status);

  return (
    <button
      onClick={advance}
      disabled={isPending}
      aria-label={`Status: ${status} — tap to advance`}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all min-h-[40px] ${config.bg} ${config.text} ${config.border} ${config.activeBg} ${isPending ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-1">
        {STATUS_ORDER.map((_, i) => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= currentIdx ? config.dot : "bg-gray-200"}`} />
        ))}
      </div>
      <span>{STATUS_LABELS[status] ?? status}</span>
      <ChevronRight size={12} className="opacity-50" />
    </button>
  );
}

function DeleteButton({ selectionId, projectId, onDeleted }: {
  selectionId: string; projectId: string; onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() => {
        if (!confirm("Remove this selection?")) return;
        startTransition(async () => {
          await deleteSelection(projectId, selectionId);
          onDeleted();
        });
      }}
      disabled={isPending}
      className="text-gray-300 hover:text-red-400 active:text-red-500 transition-colors disabled:opacity-40 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
      aria-label="Remove selection"
    >
      <Trash2 size={14} />
    </button>
  );
}

function AddSelectionForm({ projectId, category, onCreated }: {
  projectId: string; category: string; onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[#4272EF] font-medium active:text-[#3461de] py-2.5 px-4 min-h-[44px]"
      >
        <Plus size={14} /> Add item
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("category", category);
        startTransition(async () => {
          await createSelection(projectId, fd);
          setOpen(false);
          onCreated();
        });
      }}
      className="px-4 py-3 bg-gray-50/50 border-t border-gray-100 space-y-2"
    >
      <input type="hidden" name="category" value={category} />
      <input
        ref={inputRef}
        name="item_name"
        placeholder="Item name"
        required
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 min-h-[44px]"
      />
      <div className="flex items-center gap-2">
        <input
          name="notes"
          placeholder="Notes (optional)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 min-h-[44px]"
        />
        <input type="hidden" name="status" value="pending" />
        <button type="button" onClick={() => setOpen(false)}
          className="px-3 py-2.5 text-sm text-gray-400 active:text-gray-600 min-h-[44px]">Cancel</button>
        <button type="submit" disabled={isPending}
          className="px-4 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-semibold active:bg-[#3461de] transition-colors disabled:opacity-60 flex items-center gap-1 min-h-[44px]">
          {isPending && <Loader2 size={12} className="animate-spin" />}
          Add
        </button>
      </div>
    </form>
  );
}

function SelectionItem({ sel, projectId, onRefresh }: {
  sel: Selection; projectId: string; onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 group min-h-[56px]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{sel.item_name}</p>
        {sel.notes && <p className="text-xs text-gray-400 truncate mt-0.5">{sel.notes}</p>}
      </div>
      <StatusStepper selectionId={sel.id} status={sel.status} projectId={projectId} onChange={onRefresh} />
      <div className="lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
        <DeleteButton selectionId={sel.id} projectId={projectId} onDeleted={onRefresh} />
      </div>
    </div>
  );
}

export default function SelectionsTab({ projectId }: { projectId: string }) {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await createClient()
      .from("selections")
      .select("id, category, item_name, status, notes")
      .eq("project_id", projectId)
      .order("category");
    setSelections(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [projectId]);

  const byCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = selections.filter((s) => s.category === cat);
    return acc;
  }, {} as Record<string, Selection[]>);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {selections.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {STATUS_ORDER.map((st) => {
            const count = selections.filter((s) => s.status === st).length;
            const config = STATUS_CONFIG[st] ?? STATUS_CONFIG.pending;
            return (
              <div key={st} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shrink-0 ${config.bg} ${config.border}`}>
                <div className={`w-2 h-2 rounded-full ${config.dot}`} />
                <span className={`text-xs font-semibold tabular-nums ${config.text}`}>{count}</span>
                <span className={`text-xs ${config.text} opacity-70`}>{STATUS_LABELS[st]}</span>
              </div>
            );
          })}
        </div>
      )}

      {selections.length === 0 && (
        <div className="py-16 text-center border border-dashed border-gray-200 rounded-xl">
          <Palette size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No selections yet</p>
          <p className="text-xs text-gray-300 mt-1">Add items in any category below to start tracking</p>
        </div>
      )}

      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const items = byCategory[cat] ?? [];
          return (
            <div key={cat} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{cat}</span>
                {items.length > 0 && (
                  <span className="text-xs text-gray-400">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                )}
              </div>
              {items.map((s) => (
                <SelectionItem key={s.id} sel={s} projectId={projectId} onRefresh={load} />
              ))}
              <AddSelectionForm projectId={projectId} category={cat} onCreated={load} />
            </div>
          );
        })}
      </div>

      {selections.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          {"Tap a status to advance: Pending \u2192 Confirmed \u2192 Ordered \u2192 Installed"}
        </p>
      )}
    </div>
  );
}
