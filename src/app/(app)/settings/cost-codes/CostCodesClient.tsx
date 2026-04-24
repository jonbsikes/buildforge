"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { createCostCode, toggleCostCode, deleteCostCode } from "@/app/actions/cost-codes";
import ConfirmButton from "@/components/ui/ConfirmButton";
import type { Database } from "@/types/database";

type CostCode = Database["public"]["Tables"]["cost_codes"]["Row"];

const CATEGORIES = [
  "land","siteworks","foundation","framing","roofing","electrical","plumbing",
  "hvac","insulation","drywall","flooring","cabinetry","painting","landscaping",
  "permits","professional_fees","contingency","other",
];

export default function CostCodesClient({ costCodes }: { costCodes: CostCode[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createCostCode(fd);
        setShowAdd(false);
        (e.target as HTMLFormElement).reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create cost code");
      }
    });
  }

  const inactive = costCodes.filter((c) => !c.is_active);

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Cost Codes</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Organise cost items with custom codes for reporting.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 text-sm text-white px-3 py-2 rounded-lg"
          style={{ backgroundColor: "#4272EF" }}
          >
            <Plus size={15} /> Add Code
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleCreate} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">New Cost Code</h3>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Code <span className="text-red-500">*</span></label>
                <input
                  name="code"
                  required
                  placeholder="e.g. 03-001"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  name="name"
                  required
                  placeholder="e.g. Concrete Slab"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select name="category" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Project Type</label>
                <select name="project_type" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
                  <option value="">All types</option>
                  <option value="home_construction">Home Construction</option>
                  <option value="land_development">Land Development</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>
                {isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}

        {costCodes.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
            No cost codes yet. Add one to get started.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Active</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {costCodes.map((cc) => (
                  <tr key={cc.id} className={`hover:bg-gray-50 transition-colors ${!cc.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{cc.code}</td>
                    <td className="px-4 py-3 text-gray-900">{cc.name}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize text-xs">{cc.category.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {cc.project_type
                        ? cc.project_type === "home_construction" ? "Home" : "Land"
                        : <span className="text-gray-300">All</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => startTransition(async () => { await toggleCostCode(cc.id, !cc.is_active); })}
                        className={cc.is_active ? "text-green-500 hover:text-green-600" : "text-gray-300 hover:text-gray-400"}
                        title={cc.is_active ? "Deactivate" : "Activate"}
                      >
                        {cc.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ConfirmButton
                        trigger={<Trash2 size={15} />}
                        title={`Delete cost code "${cc.code}"?`}
                        body="This permanently removes the cost code."
                        confirmLabel="Delete"
                        tone="danger"
                        onConfirm={async () => {
                          await deleteCostCode(cc.id);
                        }}
                        triggerClassName="text-gray-300 hover:text-red-500 transition-colors"
                        ariaLabel={`Delete cost code ${cc.code}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {inactive.length > 0 && (
          <p className="text-xs text-gray-400 mt-2">{inactive.length} inactive code{inactive.length !== 1 ? "s" : ""} hidden from selection. Toggle to reactivate.</p>
        )}
      </section>
    </div>
  );
}
