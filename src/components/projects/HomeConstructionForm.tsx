"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  checkSubdivisionMatch,
  createHomeConstructionProject,
} from "@/app/actions/create-project";
import { CheckCircle2, ChevronRight, ChevronLeft, Info } from "lucide-react";

interface Lender {
  id: string;
  name: string;
}

interface CostCode {
  id: string;
  code: string;
  name: string;
}

interface Props {
  lenders: Lender[];
  costCodes: CostCode[]; // codes 34–102
}

interface Step1Fields {
  name: string;
  address: string;
  subdivision: string;
  block: string;
  lot: string;
  lot_size_acres: string;
  plan: string;
  home_size_sf: string;
  start_date: string;
  lender_id: string;
  status: string;
  loan_number: string;
}

const EMPTY_STEP1: Step1Fields = {
  name: "",
  address: "",
  subdivision: "",
  block: "",
  lot: "",
  lot_size_acres: "",
  plan: "",
  home_size_sf: "",
  start_date: "",
  lender_id: "",
  status: "planning",
  loan_number: "",
};

export default function HomeConstructionForm({ lenders, costCodes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<1 | 2>(1);
  const [fields, setFields] = useState<Step1Fields>(EMPTY_STEP1);
  const [errors, setErrors] = useState<Partial<Record<keyof Step1Fields, string>>>({});

  // Step 2: selected cost code IDs (default all selected)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(costCodes.map((c) => c.id))
  );

  // Subdivision auto-match
  const [subdivisionNotice, setSubdivisionNotice] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);

  function updateField<K extends keyof Step1Fields>(key: K, value: Step1Fields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof Step1Fields, string>> = {};
    if (!fields.name.trim()) newErrors.name = "Name is required";
    if (!fields.start_date) newErrors.start_date = "Start date is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleNext() {
    if (!validate()) return;

    // Check subdivision match
    if (fields.subdivision.trim()) {
      const match = await checkSubdivisionMatch(fields.subdivision.trim());
      if (match.matched && match.costCodeIds.length > 0) {
        // Auto-apply the matched subdivision's cost code selections
        setSelectedIds(new Set(match.costCodeIds));
        setSubdivisionNotice(
          `Cost codes auto-matched from an existing "${match.subdivisionName}" project. Review and adjust as needed.`
        );
      } else {
        setSubdivisionNotice(null);
      }
    } else {
      setSubdivisionNotice(null);
    }

    setStep(2);
  }

  function toggleCode(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    setSubmitError(null);
    startTransition(async () => {
      const result = await createHomeConstructionProject({
        ...fields,
        selected_cost_code_ids: Array.from(selectedIds),
      });
      if (result.error) {
        setSubmitError(result.error);
      } else if (result.projectId) {
        router.push(`/projects/${result.projectId}`);
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {[
          { n: 1, label: "Project Details" },
          { n: 2, label: "Cost Codes" },
        ].map(({ n, label }) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                step === n
                  ? "bg-[#4272EF] text-white"
                  : step > n
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {step > n ? <CheckCircle2 size={16} /> : n}
            </div>
            <span
              className={`text-sm font-medium ${
                step === n ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {label}
            </span>
            {n < 2 && <ChevronRight size={16} className="text-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <Field
            label="Project Name"
            required
            error={errors.name}
          >
            <input
              type="text"
              value={fields.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g. Smith Residence"
              className={inputClass(!!errors.name)}
            />
          </Field>

          <Field label="Address">
            <input
              type="text"
              value={fields.address}
              onChange={(e) => updateField("address", e.target.value)}
              placeholder="123 Main St, City, State"
              className={inputClass(false)}
            />
          </Field>

          <Field label="Subdivision">
            <input
              type="text"
              value={fields.subdivision}
              onChange={(e) => updateField("subdivision", e.target.value)}
              placeholder="e.g. Prairie Sky Estates"
              className={inputClass(false)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Block">
              <input
                type="text"
                value={fields.block}
                onChange={(e) => updateField("block", e.target.value)}
                placeholder="e.g. A"
                className={inputClass(false)}
              />
            </Field>
            <Field label="Lot">
              <input
                type="text"
                value={fields.lot}
                onChange={(e) => updateField("lot", e.target.value)}
                placeholder="e.g. 14"
                className={inputClass(false)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Lot Size (acres)">
              <input
                type="number"
                step="0.001"
                min="0"
                value={fields.lot_size_acres}
                onChange={(e) => updateField("lot_size_acres", e.target.value)}
                placeholder="0.000"
                className={inputClass(false)}
              />
            </Field>
            <Field label="Home Size (SF)">
              <input
                type="number"
                min="0"
                value={fields.home_size_sf}
                onChange={(e) => updateField("home_size_sf", e.target.value)}
                placeholder="0"
                className={inputClass(false)}
              />
            </Field>
          </div>

          <Field label="Plan (house plan/model name)">
            <input
              type="text"
              value={fields.plan}
              onChange={(e) => updateField("plan", e.target.value)}
              placeholder="e.g. Ridgeline 2400"
              className={inputClass(false)}
            />
          </Field>

          <Field label="Start Date" required error={errors.start_date}>
            <input
              type="date"
              value={fields.start_date}
              onChange={(e) => updateField("start_date", e.target.value)}
              className={inputClass(!!errors.start_date)}
            />
          </Field>

          <Field label="Lender">
            <select
              value={fields.lender_id}
              onChange={(e) => updateField("lender_id", e.target.value)}
              className={inputClass(false)}
            >
              <option value="">— Select lender —</option>
              {lenders.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <select
                value={fields.status}
                onChange={(e) => updateField("status", e.target.value)}
                className={inputClass(false)}
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>

            <Field label="Loan Number">
              <input
                type="text"
                value={fields.loan_number}
                onChange={(e) => updateField("loan_number", e.target.value)}
                placeholder="e.g. LN-2024-001"
                className={inputClass(false)}
              />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
            >
              Next: Cost Codes
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          {subdivisionNotice && (
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
              {subdivisionNotice}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-medium text-gray-900">Select Cost Codes</h3>
              <span className="text-xs text-gray-400">
                {selectedIds.size} of {costCodes.length} selected
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              All home construction codes are pre-selected. Deselect any that don&apos;t apply to this project.
            </p>

            <div className="grid grid-cols-1 gap-1">
              {costCodes.map((cc) => {
                const checked = selectedIds.has(cc.id);
                return (
                  <label
                    key={cc.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer select-none transition-colors ${
                      checked ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCode(cc.id)}
                      className="w-4 h-4 rounded accent-[#4272EF]"
                    />
                    <span className="text-xs font-mono text-gray-400 w-8 flex-shrink-0">
                      {cc.code}
                    </span>
                    <span className="text-sm text-gray-800">{cc.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {submitError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-4 py-2.5 text-gray-600 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="px-6 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? "Creating…" : "Create Project"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] focus:border-transparent transition-colors ${
    hasError ? "border-red-400" : "border-gray-300"
  }`;
}
