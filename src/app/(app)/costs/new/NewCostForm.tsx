// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Database } from "@/types/database";

type Project = Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name" | "project_type">;
type Stage = Pick<Database["public"]["Tables"]["stages"]["Row"], "id" | "name" | "project_id">;
type CostCode = Pick<Database["public"]["Tables"]["cost_codes"]["Row"], "code" | "description" | "category">;

const CATEGORIES: { value: string; label: string }[] = [
  { value: "land", label: "Land" },
  { value: "siteworks", label: "Siteworks" },
  { value: "foundation", label: "Foundation" },
  { value: "framing", label: "Framing" },
  { value: "roofing", label: "Roofing" },
  { value: "electrical", label: "Electrical" },
  { value: "plumbing", label: "Plumbing" },
  { value: "hvac", label: "HVAC" },
  { value: "insulation", label: "Insulation" },
  { value: "drywall", label: "Drywall" },
  { value: "flooring", label: "Flooring" },
  { value: "cabinetry", label: "Cabinetry" },
  { value: "painting", label: "Painting" },
  { value: "landscaping", label: "Landscaping" },
  { value: "permits", label: "Permits" },
  { value: "professional_fees", label: "Professional Fees" },
  { value: "contingency", label: "Contingency" },
  { value: "other", label: "Other" },
];

interface Props {
  projects: Project[];
  stages: Stage[];
  costCodes: CostCode[];
  defaultProjectId?: string;
}

export default function NewCostForm({ projects, stages, costCodes, defaultProjectId }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultProject = projects.find((p) => p.id === defaultProjectId) ?? projects[0];

  const [form, setForm] = useState({
    project_id: defaultProjectId ?? (defaultProject?.id ?? ""),
    stage_id: "",
    cost_code_id: "",
    category: "other",
    description: "",
    budgeted_amount: "",
    actual_amount: "",
    vendor: "",
    invoice_date: "",
    invoice_number: "",
    notes: "",
  });

  function set(field: string, value: string) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "project_id") {
        next.stage_id = "";
        next.cost_code_id = "";
      }
      if (field === "cost_code_id" && value) {
        const code = costCodes.find((c) => String(c.code) === value);
        if (code) next.category = code.category;
      }
      return next;
    });
  }

  const selectedProject = projects.find((p) => p.id === form.project_id);
  const projectStages = stages.filter((s) => s.project_id === form.project_id);

  // Filter cost codes to match the selected project's type, plus any without a type
  const relevantCodes = useMemo(() => {
    if (!selectedProject) return costCodes;
    const isLand = selectedProject.project_type === "land_development";
    return costCodes.filter((c) =>
      isLand ? c.code <= 33 : c.code >= 34
    );
  }, [costCodes, selectedProject]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase.from("cost_items").insert({
      project_id: form.project_id,
      stage_id: form.stage_id || null,
      cost_code_id: form.cost_code_id || null,
      category: form.category,
      description: form.description,
      budgeted_amount: parseFloat(form.budgeted_amount) || 0,
      actual_amount: parseFloat(form.actual_amount) || 0,
      vendor: form.vendor || null,
      invoice_date: form.invoice_date || null,
      invoice_number: form.invoice_number || null,
      notes: form.notes || null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
    } else {
      router.push(form.project_id ? `/projects/${form.project_id}` : "/costs");
      router.refresh();
    }
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <Link
          href={defaultProjectId ? `/projects/${defaultProjectId}` : "/costs"}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft size={15} />
          Back
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Cost Item Details</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Project + Stage */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={form.project_id}
                  onChange={(e) => set("project_id", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
                <select
                  value={form.stage_id}
                  onChange={(e) => set("stage_id", e.target.value)}
                  disabled={projectStages.length === 0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">No stage</option>
                  {projectStages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cost Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost Code
              </label>
              <select
                value={form.cost_code_id}
                onChange={(e) => set("cost_code_id", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— No cost code —</option>
                {relevantCodes.map((c) => (
                  <option key={c.code} value={String(c.code)}>
                    {c.code} — {c.description}
                  </option>
                ))}
              </select>
              {relevantCodes.length === 0 && form.project_id && (
                <p className="text-xs text-gray-400 mt-1">
                  No cost codes found. <Link href="/settings/cost-codes" className="text-blue-500 hover:underline">Set up cost codes</Link>
                </p>
              )}
            </div>

            {/* Description + Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="e.g. Concrete pour — slab foundation"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {form.cost_code_id && (
                <p className="text-xs text-gray-400 mt-1">Auto-set from cost code.</p>
              )}
            </div>

            {/* Budget + Actual */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Budgeted (AUD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.budgeted_amount}
                  onChange={(e) => set("budgeted_amount", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Actual (AUD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.actual_amount}
                  onChange={(e) => set("actual_amount", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Invoice details */}
            <div className="border-t border-gray-100 pt-5">
              <p className="text-sm font-medium text-gray-700 mb-4">Invoice Details (optional)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                  <input
                    type="text"
                    value={form.vendor}
                    onChange={(e) => set("vendor", e.target.value)}
                    placeholder="e.g. Brisbane Concrete Co."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value={form.invoice_number}
                    onChange={(e) => set("invoice_number", e.target.value)}
                    placeholder="e.g. INV-0042"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={form.invoice_date}
                  onChange={(e) => set("invoice_date", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Cost Item"}
              </button>
              <Link
                href={defaultProjectId ? `/projects/${defaultProjectId}` : "/costs"}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
