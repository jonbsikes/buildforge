"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLoan, updateLoan, type LoanInput } from "@/app/actions/banking";

interface Project { id: string; name: string }
interface Lender { id: string; name: string }

interface Props {
  projects: Project[];
  lenders: Lender[];
  initial?: Partial<LoanInput> & { id?: string };
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paid_off", label: "Paid Off" },
  { value: "in_default", label: "In Default" },
];

const LOAN_TYPE_OPTIONS = [
  { value: "term_loan", label: "Term Loan" },
  { value: "line_of_credit", label: "Line of Credit" },
];

function ic(err = false) {
  return `w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] focus:border-transparent ${err ? "border-red-400" : "border-gray-300"}`;
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

export default function LoanForm({ projects, lenders, initial }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState<LoanInput>({
    project_id: initial?.project_id ?? "",
    lender_id: initial?.lender_id ?? "",
    loan_number: initial?.loan_number ?? "",
    loan_amount: initial?.loan_amount ?? "",
    loan_type: initial?.loan_type ?? "term_loan",
    credit_limit: initial?.credit_limit ?? "",
    current_balance: initial?.current_balance ?? "",
    interest_rate: initial?.interest_rate ?? "",
    origination_date: initial?.origination_date ?? "",
    maturity_date: initial?.maturity_date ?? "",
    status: initial?.status ?? "active",
    notes: initial?.notes ?? "",
  });

  const [errs, setErrs] = useState<Partial<Record<keyof LoanInput, string>>>({});

  const s = (k: keyof LoanInput, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errs[k]) setErrs((p) => ({ ...p, [k]: undefined }));
  };

  const isLOC = f.loan_type === "line_of_credit";

  function validate() {
    const e: Partial<Record<keyof LoanInput, string>> = {};
    if (!f.project_id) e.project_id = "Required";
    if (!f.lender_id) e.lender_id = "Required";
    if (!f.loan_number.trim()) e.loan_number = "Required";
    if (!isLOC && (!f.loan_amount || isNaN(parseFloat(f.loan_amount)))) e.loan_amount = "Enter a valid amount";
    if (isLOC && (!f.credit_limit || isNaN(parseFloat(f.credit_limit)))) e.credit_limit = "Enter a valid credit limit";
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  function save() {
    if (!validate()) return;
    setError(null);
    startTransition(async () => {
      const result = initial?.id
        ? await updateLoan(initial.id, f)
        : await createLoan(f);
      if (result.error) {
        setError(result.error);
      } else {
        router.push("/banking/loans");
      }
    });
  }

  const isEdit = !!initial?.id;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 max-w-2xl">
      <h3 className="text-sm font-semibold text-gray-700">
        {isEdit ? "Edit Loan" : "New Loan"}
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Project" required error={errs.project_id}>
          <select value={f.project_id} onChange={(e) => s("project_id", e.target.value)} className={ic(!!errs.project_id)}>
            <option value="">— Select project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Lender" required error={errs.lender_id}>
          <select value={f.lender_id} onChange={(e) => s("lender_id", e.target.value)} className={ic(!!errs.lender_id)}>
            <option value="">— Select lender —</option>
            {lenders.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Loan Number" required error={errs.loan_number}>
          <input type="text" value={f.loan_number} onChange={(e) => s("loan_number", e.target.value)} placeholder="e.g. 2024-001" className={ic(!!errs.loan_number)} />
        </Field>
        <Field label="Loan Type">
          <select value={f.loan_type} onChange={(e) => s("loan_type", e.target.value)} className={ic()}>
            {LOAN_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {!isLOC && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Loan Amount" required error={errs.loan_amount}>
            <input type="number" min="0" step="0.01" value={f.loan_amount} onChange={(e) => s("loan_amount", e.target.value)} placeholder="0.00" className={ic(!!errs.loan_amount)} />
          </Field>
          <div />
        </div>
      )}

      {isLOC && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Credit Limit" required error={errs.credit_limit}>
            <input type="number" min="0" step="0.01" value={f.credit_limit} onChange={(e) => s("credit_limit", e.target.value)} placeholder="0.00" className={ic(!!errs.credit_limit)} />
          </Field>
          <Field label="Current Balance">
            <input type="number" min="0" step="0.01" value={f.current_balance} onChange={(e) => s("current_balance", e.target.value)} placeholder="0.00" className={ic()} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Interest Rate (%)">
          <input type="number" min="0" step="0.001" value={f.interest_rate} onChange={(e) => s("interest_rate", e.target.value)} placeholder="e.g. 7.25" className={ic()} />
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={(e) => s("status", e.target.value)} className={ic()}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Origination Date">
          <input type="date" value={f.origination_date} onChange={(e) => s("origination_date", e.target.value)} className={ic()} />
        </Field>
        <Field label="Maturity Date">
          <input type="date" value={f.maturity_date} onChange={(e) => s("maturity_date", e.target.value)} className={ic()} />
        </Field>
      </div>

      <Field label="Notes">
        <textarea value={f.notes} onChange={(e) => s("notes", e.target.value)} rows={2} placeholder="Optional notes" className={ic() + " resize-none"} />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => router.push("/banking/loans")}
          className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={isPending}
          className="px-5 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] disabled:opacity-60"
        >
          {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Loan"}
        </button>
      </div>
    </div>
  );
}
