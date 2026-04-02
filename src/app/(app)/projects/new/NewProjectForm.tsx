"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, HardHat, Landmark } from "lucide-react";
import type { ProjectStatus, ProjectType } from "@/types/database";

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:outline-none";
const labelCls = "block text-sm font-medium text-gray-700 mb-1";

export default function NewProjectForm() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    address: "",
    description: "",
    project_type: "home_construction" as ProjectType,
    status: "planning" as ProjectStatus,
    contract_price: "",
    start_date: "",
    end_date: "",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: form.name,
        address: form.address || null,
        description: form.description || null,
        project_type: form.project_type,
        status: form.status,
        contract_price: form.contract_price ? parseFloat(form.contract_price) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      })
      .select("id")
      .single();

    if (projectError || !project) {
      setError(projectError?.message ?? "Failed to create project");
      setSaving(false);
      return;
    }

    router.push(`/projects/${project.id}`);
  }

  return (
    <main className="flex-1 p-4 sm:p-6 overflow-auto bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Projects
        </Link>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">New Project</h1>
            <p className="text-sm text-gray-500 mt-0.5">Fill in the details to create a new project.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Type Selector */}
            <div>
              <label className={labelCls}>
                Project Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { value: "home_construction", label: "Home Construction", icon: HardHat, desc: "New builds, renovations, custom homes" },
                  { value: "land_development", label: "Land Development", icon: Landmark, desc: "Subdivisions, civil works, lot sales" },
                ] as const).map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("project_type", value)}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                      form.project_type === value
                        ? "border-amber-500 bg-amber-50"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <Icon
                      size={20}
                      className={`mt-0.5 shrink-0 ${form.project_type === value ? "text-amber-600" : "text-gray-400"}`}
                    />
                    <div>
                      <p className={`font-semibold text-sm ${form.project_type === value ? "text-amber-700" : "text-gray-700"}`}>
                        {label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Project Name */}
            <div>
              <label className={labelCls}>
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={form.project_type === "home_construction" ? "e.g. 14 Elm Street — New Build" : "e.g. Riverside Estate Stage 1"}
                className={inputCls}
              />
            </div>

            {/* Address */}
            <div>
              <label className={labelCls}>Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="e.g. 14 Elm Street, Springfield TX 78201"
                className={inputCls}
              />
            </div>

            {/* Description */}
            <div>
              <label className={labelCls}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="Brief notes about the project..."
                className={`${inputCls} resize-none`}
              />
            </div>

            {/* Status + Contract Price */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  className={`${inputCls} bg-white`}
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Contract / Sale Price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={form.contract_price}
                  onChange={(e) => set("contract_price", e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Start Date</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => set("start_date", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Target Close Date</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => set("end_date", e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-white font-medium rounded-lg py-2.5 px-4 text-sm disabled:opacity-50 transition-colors"
              >
                {saving ? "Creating..." : "Create Project"}
              </button>
              <Link
                href="/projects"
                className="px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg text-sm transition-colors"
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
