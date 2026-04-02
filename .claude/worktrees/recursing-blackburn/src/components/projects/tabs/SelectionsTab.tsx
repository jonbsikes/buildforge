"use client";

import { useState, useTransition, useEffect } from "react";
import { Plus, Trash2, Loader2, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createSelection,
  updateSelectionStatus,
  deleteSelection,
} from "@/app/(app)/projects/[id]/actions";

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

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-gray-100 text-gray-600",
  confirmed: "bg-blue-100 text-blue-700",
  ordered:   "bg-purple-100 text-purple-700",
  installed: "bg-green-100 text-green-700",
};

// ── Status cycle button ───────────────────────────────────────────────────────
function StatusBadge({ selectionId, status, projectId, onChange }: {
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

  return (
    <button
      onClick={advance}
      disabled={isPending}
      title="Click to advance status"
      className={`text-xs font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 transition-opacity ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"} ${isPending ? "opacity-50" : "hover:opacity-80"}`}
    >
      {status}
      <ChevronDown size={10} />
    </button>
  );
}

// ── Delete button ─────────────────────────────────────────────────────────────
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
      className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
    >
      <Trash2 size={13} />
    </button>
  );
}

// ── New selection form (inline at bottom of category) ────────────────────────
function AddSelectionForm({ projectId, category, onCreated }: {
  projectId: string; category: string; onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-[#4272EF] flex items-center gap-1 hover:underline py-1 px-4"
      >
        <Plus size={12} /> Add item to {category}
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
      className="flex flex-wrap items-center gap-2 px-4 py-2 bg-gray-50 border-t border-gray-100"
    >
      <input type="hidden" name="category" value={category} />
      <input
        name="item_name"
        placeholder="Item name *"
        required
        className="flex-1 min-w-40 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#4272EF]"
      />
      <select
        name="status"
        defaultValue="pending"
        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#4272EF]"
      >
        {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input
        name="notes"
        placeholder="Notes (optional)"
        className="flex-1 min-w-32 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#4272EF]"
      />
      <button
        type="submit"
        disabled={isPending}
        className="px-3 py-1.5 bg-[#4272EF] text-white rounded-lg text-xs font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60 flex items-center gap-1"
      >
        {isPending && <Loader2 size={11} className="animate-spin" />}
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">
        Cancel
      </button>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
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

  const totalInstalled = selections.filter((s) => s.status === "installed").length;
  const totalPending   = selections.filter((s) => s.status === "pending").length;

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {selections.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {STATUS_ORDER.map((st) => {
            const count = selections.filter((s) => s.status === st).length;
            if (count === 0) return null;
            return (
              <span key={st} className={`px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[st]}`}>
                {count} {st}
              </span>
            );
          })}
        </div>
      )}

      {selections.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No selections yet. Use the buttons below to add items by category.
        </div>
      )}

      {/* Category groups */}
      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const items = byCategory[cat] ?? [];
          return (
            <div key={cat} className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{cat}</span>
                {items.length > 0 && (
                  <span className="text-xs text-gray-400">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                )}
              </div>

              {items.length > 0 && (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {items.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-4 py-2.5 text-gray-800 font-medium">{s.item_name}</td>
                        <td className="px-3 py-2.5 w-28">
                          <StatusBadge
                            selectionId={s.id}
                            status={s.status}
                            projectId={projectId}
                            onChange={load}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-400 max-w-xs truncate">{s.notes ?? ""}</td>
                        <td className="px-3 py-2.5 w-8 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                          <DeleteButton selectionId={s.id} projectId={projectId} onDeleted={load} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}

              <AddSelectionForm projectId={projectId} category={cat} onCreated={load} />
            </div>
          );
        })}
      </div>

      {selections.length > 0 && (
        <p className="text-xs text-gray-400">
          Click a status badge to advance it: pending → confirmed → ordered → installed
        </p>
      )}
    </div>
  );
}
