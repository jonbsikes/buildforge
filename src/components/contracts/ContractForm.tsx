"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createContract, updateContract, type ContractInput } from "@/app/actions/contracts";

interface Vendor { id: string; name: string }
interface Project { id: string; name: string; project_type: string }
interface CostCode { id: string; code: string; name: string; project_type: string | null }

interface Props {
  vendors: Vendor[];
  projects: Project[];
  costCodes: CostCode[];
  editId?: string;
  defaults?: Partial<ContractInput>;
}

const STATUSES = [
  { value: "draft",     label: "Draft" },
  { value: "active",    label: "Active" },
  { value: "signed",    label: "Signed" },
  { value: "completed", label: "Completed" },
  { value: "voided",    label: "Voided" },
];

function ic(err = false) {
  return `w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] focus:border-transparent transition-colors ${err ? "border-red-400" : "border-gray-300"}`;
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ContractForm({ vendors, projects, costCodes, editId, defaults }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ContractInput, string>>>({});

  const [f, setF] = useState<ContractInput>({
    project_id:   defaults?.project_id   ?? "",
    description:  defaults?.description  ?? "",
    vendor_id:    defaults?.vendor_id    ?? "",
    cost_code_id: defaults?.cost_code_id ?? "",
    amount:       defaults?.amount       ?? "",
    status:       defaults?.status       ?? "draft",
    signed_date:  defaults?.signed_date  ?? "",
    notes:        defaults?.notes        ?? "",
  });

  const s = (k: keyof ContractInput, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Filter cost codes to the selected project's type
  const selectedProject = projects.find((p) => p.id === f.project_id);
  const filteredCodes = costCodes.filter((c) => {
    if (!selectedProject) return true;
    if (selectedProject.project_type === "home_construction") return c.project_type === "home_construction";
    return c.project_type === "land_development";
  });

  function validate() {
    const e: typeof errors = {};
    if (!f.project_id) e.project_id = "Project is required";
    if (!f.description.trim()) e.description = "Description is required";
    if (f.amount && isNaN(parseFloat(f.amount))) e.amount = "Must be a valid number";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function save() {
    if (!validate()) return;
    setError(null);
    startTransition(async () => {
      const result = editId
        ? await updateContract(editId, f)
        : await createContract(f);
      if (result.error) { setError(result.error); return; }
      router.push("/contracts");
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <Field label="Project" required error={errors.project_id}>
          <select
            value={f.project_id}
            onChange={(e) => { s("project_id", e.target.value); s("cost_code_id", ""); }}
            className={ic(!!errors.project_id)}
          >
            <option value="">— Select a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Description" required error={errors.description}>
          <input
            type="text"
            value={f.description}
            onChange={(e) => s("description", e.target.value)}
            placeholder="e.g. Framing contract — Lot 14"
            className={ic(!!errors.description)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Vendor">
            <select value={f.vendor_id} onChange={(e) => s("vendor_id", e.target.value)} className={ic()}>
              <option value="">— No vendor —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>

          <Field label="Cost Code">
            <select value={f.cost_code_id} onChange={(e) => s("cost_code_id", e.target.value)} className={ic()}>
              <option value="">— No cost code —</option>
              {filteredCodes.map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Contract Amount" error={errors.amount}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={f.amount}
                onChange={(e) => s("amount", e.target.value)}
                placeholder="0.00"
                className={`${ic(!!errors.amount)} pl-7`}
              />
            </div>
          </Field>

          <Field label="Status">
            <select value={f.status} onChange={(e) => s("status", e.target.value)} className={ic()}>
              {STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Signed Date">
          <input type="date" value={f.signed_date} onChange={(e) => s("signed_date", e.target.value)} className={ic()} />
        </Field>

        <Field label="Notes">
          <textarea
            value={f.notes}
            onChange={(e) => s("notes", e.target.value)}
            rows={3}
            placeholder="Any additional notes…"
            className={ic()}
          />
        </Field>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/contracts")}
          className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={save}
            disabled={isPending}
            className="px-5 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
          >
            {isPending ? "Saving…" : editId ? "Save Changes" : "Create Contract"}
          </button>
        </div>
      </div>
    </div>
  );
}
