"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info, Plus } from "lucide-react";
import {
  updateHomeProject,
  updateLandProject,
  ensureLoan,
  type UpdateHomeInput,
  type UpdateLandInput,
} from "@/app/actions/projects";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Lender { id: string; name: string }

interface ExistingLoan {
  id: string;
  loan_number: string;
  loan_amount: number;
  status: string;
}

interface Project {
  id: string;
  project_type: string;
  name: string;
  address: string | null;
  status: string | null;
  subdivision: string | null;
  block: string | null;
  lot: string | null;
  lot_size_acres: number | null;
  plan: string | null;
  home_size_sf: number | null;
  size_acres: number | null;
  number_of_lots: number | null;
  number_of_phases: number | null;
  start_date: string | null;
  lender_id: string | null;
}

interface Props {
  project: Project;
  lenders: Lender[];
  existingLoans: ExistingLoan[];
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function Field({
  label, required, error, hint, children,
}: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

const ic = (err = false) =>
  `w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] focus:border-transparent transition-colors ${err ? "border-red-400" : "border-gray-300"}`;

// ---------------------------------------------------------------------------
// Loan section — shows existing loans + "add new" input
// ---------------------------------------------------------------------------

function LoanSection({
  projectId, lenderId, existingLoans,
}: { projectId: string; lenderId: string; existingLoans: ExistingLoan[] }) {
  const [newLoanNumber, setNewLoanNumber] = useState("");
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);
  const [addedLoans, setAddedLoans] = useState<ExistingLoan[]>([]);

  const allLoans = [...existingLoans, ...addedLoans];

  function handleAdd() {
    if (!newLoanNumber.trim()) return;
    if (!lenderId) {
      setMsg({ type: "error", text: "Select a lender before adding a loan number." });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const result = await ensureLoan(projectId, newLoanNumber.trim(), lenderId);
      if (result.error) {
        setMsg({ type: "error", text: result.error });
      } else if (result.created) {
        setMsg({
          type: "success",
          text: `Loan #${newLoanNumber.trim()} created and linked to this project. Open Banking → Loans to fill in the amount and terms.`,
        });
        setAddedLoans((p) => [...p, { id: "", loan_number: newLoanNumber.trim(), loan_amount: 0, status: "active" }]);
        setNewLoanNumber("");
      } else {
        setMsg({ type: "info", text: `Loan #${newLoanNumber.trim()} already exists for this project — no duplicate created.` });
        setNewLoanNumber("");
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Loans</h3>

      {allLoans.length > 0 && (
        <div className="space-y-1.5">
          {allLoans.map((loan, i) => (
            <div key={loan.id || i} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="font-medium text-gray-800">#{loan.loan_number}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                loan.status === "active" ? "bg-green-100 text-green-700" :
                loan.status === "paid_off" ? "bg-blue-100 text-blue-700" :
                "bg-red-100 text-red-600"
              }`}>
                {loan.status.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">
          {allLoans.length > 0 ? "Link another loan number" : "Loan Number"}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newLoanNumber}
            onChange={(e) => setNewLoanNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
            placeholder="e.g. 2024-001"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !newLoanNumber.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-50"
          >
            <Plus size={14} />
            {isPending ? "…" : "Add"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Creates a loan linked to this project and lender. Fill in amount from Banking → Loans.
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${
          msg.type === "success" ? "bg-green-50 border border-green-200 text-green-800" :
          msg.type === "info"    ? "bg-blue-50 border border-blue-200 text-blue-800" :
          "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {msg.type === "success" && <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />}
          {msg.type === "info" && <Info size={13} className="flex-shrink-0 mt-0.5" />}
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions row
// ---------------------------------------------------------------------------

function FormActions({
  projectId, isPending, error, onSave,
}: { projectId: string; isPending: boolean; error: string | null; onSave: () => void }) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => router.push(`/projects/${projectId}`)}
        className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        Cancel
      </button>
      <div className="flex items-center gap-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={onSave}
          disabled={isPending}
          className="px-5 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home Construction form
// ---------------------------------------------------------------------------

function HomeEditForm({ project, lenders, existingLoans }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState<UpdateHomeInput>({
    name: project.name ?? "",
    address: project.address ?? "",
    subdivision: project.subdivision ?? "",
    block: project.block ?? "",
    lot: project.lot ?? "",
    lot_size_acres: project.lot_size_acres != null ? String(project.lot_size_acres) : "",
    plan: project.plan ?? "",
    home_size_sf: project.home_size_sf != null ? String(project.home_size_sf) : "",
    start_date: project.start_date ?? "",
    lender_id: project.lender_id ?? "",
    status: project.status ?? "planning",
  });

  const s = <K extends keyof UpdateHomeInput>(k: K, v: UpdateHomeInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  function save() {
    if (!f.name.trim()) { setError("Project name is required"); return; }
    setError(null);
    startTransition(async () => {
      const result = await updateHomeProject(project.id, f);
      if (result.error) setError(result.error);
      else router.push(`/projects/${project.id}`);
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-700">Home Construction — Project Details</h3>

        <Field label="Project Name" required>
          <input type="text" value={f.name} onChange={(e) => s("name", e.target.value)} className={ic()} />
        </Field>
        <Field label="Address">
          <input type="text" value={f.address} onChange={(e) => s("address", e.target.value)} placeholder="123 Main St, City, State" className={ic()} />
        </Field>
        <Field label="Subdivision">
          <input type="text" value={f.subdivision} onChange={(e) => s("subdivision", e.target.value)} placeholder="e.g. Prairie Sky Estates" className={ic()} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Block">
            <input type="text" value={f.block} onChange={(e) => s("block", e.target.value)} placeholder="e.g. A" className={ic()} />
          </Field>
          <Field label="Lot">
            <input type="text" value={f.lot} onChange={(e) => s("lot", e.target.value)} placeholder="e.g. 14" className={ic()} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Lot Size (acres)">
            <input type="number" step="0.001" min="0" value={f.lot_size_acres} onChange={(e) => s("lot_size_acres", e.target.value)} className={ic()} />
          </Field>
          <Field label="Home Size (SF)">
            <input type="number" min="0" value={f.home_size_sf} onChange={(e) => s("home_size_sf", e.target.value)} className={ic()} />
          </Field>
        </div>
        <Field label="Plan">
          <input type="text" value={f.plan} onChange={(e) => s("plan", e.target.value)} placeholder="e.g. Ridgeline 2400" className={ic()} />
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={(e) => s("status", e.target.value)} className={ic()}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field label="Start Date" hint="Changing the start date does not automatically recalculate build stage dates.">
          <input type="date" value={f.start_date} onChange={(e) => s("start_date", e.target.value)} className={ic()} />
        </Field>
        <Field label="Lender">
          <select value={f.lender_id} onChange={(e) => s("lender_id", e.target.value)} className={ic()}>
            <option value="">— No lender —</option>
            {lenders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
      </div>

      <LoanSection projectId={project.id} lenderId={f.lender_id} existingLoans={existingLoans} />

      <FormActions projectId={project.id} isPending={isPending} error={error} onSave={save} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Land Development form
// ---------------------------------------------------------------------------

function LandEditForm({ project, lenders, existingLoans }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [f, setF] = useState<UpdateLandInput>({
    name: project.name ?? "",
    address: project.address ?? "",
    size_acres: project.size_acres != null ? String(project.size_acres) : "",
    number_of_lots: project.number_of_lots != null ? String(project.number_of_lots) : "",
    number_of_phases: project.number_of_phases != null ? String(project.number_of_phases) : "",
    start_date: project.start_date ?? "",
    lender_id: project.lender_id ?? "",
    status: project.status ?? "planning",
  });

  const s = <K extends keyof UpdateLandInput>(k: K, v: UpdateLandInput[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  function save() {
    if (!f.name.trim()) { setError("Project name is required"); return; }
    setError(null);
    startTransition(async () => {
      const result = await updateLandProject(project.id, f);
      if (result.error) setError(result.error);
      else router.push(`/projects/${project.id}`);
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-700">Land Development — Project Details</h3>

        <Field label="Project Name" required>
          <input type="text" value={f.name} onChange={(e) => s("name", e.target.value)} className={ic()} />
        </Field>
        <Field label="Address">
          <input type="text" value={f.address} onChange={(e) => s("address", e.target.value)} placeholder="123 County Road, City, State" className={ic()} />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Size (acres)">
            <input type="number" step="0.001" min="0" value={f.size_acres} onChange={(e) => s("size_acres", e.target.value)} className={ic()} />
          </Field>
          <Field label="Number of Lots">
            <input type="number" min="0" value={f.number_of_lots} onChange={(e) => s("number_of_lots", e.target.value)} className={ic()} />
          </Field>
          <Field label="Number of Phases">
            <input type="number" min="0" value={f.number_of_phases} onChange={(e) => s("number_of_phases", e.target.value)} className={ic()} />
          </Field>
        </div>
        <Field label="Status">
          <select value={f.status} onChange={(e) => s("status", e.target.value)} className={ic()}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field label="Start Date" hint="Changing the start date does not automatically recalculate build stage dates.">
          <input type="date" value={f.start_date} onChange={(e) => s("start_date", e.target.value)} className={ic()} />
        </Field>
        <Field label="Lender">
          <select value={f.lender_id} onChange={(e) => s("lender_id", e.target.value)} className={ic()}>
            <option value="">— No lender —</option>
            {lenders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
      </div>

      <LoanSection projectId={project.id} lenderId={f.lender_id} existingLoans={existingLoans} />

      <FormActions projectId={project.id} isPending={isPending} error={error} onSave={save} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function EditProjectForm({ project, lenders, existingLoans }: Props) {
  return project.project_type === "home_construction"
    ? <HomeEditForm project={project} lenders={lenders} existingLoans={existingLoans} />
    : <LandEditForm project={project} lenders={lenders} existingLoans={existingLoans} />;
}
