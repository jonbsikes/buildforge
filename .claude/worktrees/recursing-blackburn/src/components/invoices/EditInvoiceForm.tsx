"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, Info } from "lucide-react";
import { updateInvoice, type UpdateInvoiceInput } from "@/app/actions/invoices";

interface Vendor { id: string; name: string }
interface Project { id: string; name: string; project_type: "home_construction" | "land_development" }
interface CostCode { id: string; code: string; name: string }
interface Contract { id: string; label: string; amount: number; status: string }

interface LineItem {
  cost_code: string;
  description: string;
  amount: string;
}

interface InitialData {
  project_id: string | null;
  vendor_id: string | null;
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  pending_draw: boolean;
  status: string;
  payment_method: string | null;
  ai_confidence: string | null;
  ai_notes: string | null;
  contract_id: string | null;
  line_items: { cost_code: string; description: string | null; amount: number }[];
  project_name: string | null;
}

interface Props {
  invoiceId: string;
  initial: InitialData;
  vendors: Vendor[];
  projects: Project[];
  costCodes: CostCode[];
  contracts: Contract[];
}

const EMPTY_LINE: LineItem = { cost_code: "", description: "", amount: "" };

function getCodesForContext(
  projectType: "home_construction" | "land_development" | null,
  allCodes: CostCode[]
): CostCode[] {
  if (projectType === "home_construction") return allCodes.filter((c) => { const n = parseInt(c.code, 10); return n >= 34 && n <= 102; });
  if (projectType === "land_development") return allCodes.filter((c) => { const n = parseInt(c.code, 10); return n >= 1 && n <= 33; });
  return allCodes.filter((c) => { const n = parseInt(c.code, 10); return n >= 103 && n <= 120; });
}

function ic(err = false) {
  return `w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] focus:border-transparent ${err ? "border-red-400" : "border-gray-300"}`;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function EditInvoiceForm({ invoiceId, initial, vendors, projects, costCodes, contracts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [projectId, setProjectId] = useState(initial.project_id ?? "");
  const [contractId, setContractId] = useState(initial.contract_id ?? "");
  const [vendorId, setVendorId] = useState(initial.vendor_id ?? "");
  const [vendorName, setVendorName] = useState(initial.vendor ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initial.invoice_number ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initial.invoice_date ?? "");
  const [dueDate, setDueDate] = useState(initial.due_date ?? "");
  const [pendingDraw, setPendingDraw] = useState(initial.pending_draw);
  const [status, setStatus] = useState<"pending_review" | "approved" | "disputed">(
    (initial.status === "approved" || initial.status === "disputed") ? initial.status : "pending_review"
  );
  const [paymentMethod, setPaymentMethod] = useState(initial.payment_method ?? "");
  const [lineItems, setLineItems] = useState<LineItem[]>(
    initial.line_items.length > 0
      ? initial.line_items.map((li) => ({
          cost_code: li.cost_code,
          description: li.description ?? "",
          amount: String(li.amount),
        }))
      : [{ ...EMPTY_LINE }]
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const relevantCodes = getCodesForContext(selectedProject?.project_type ?? null, costCodes);

  const lineTotal = lineItems.reduce((sum, li) => {
    const n = parseFloat(li.amount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  function updateLine(idx: number, key: keyof LineItem, value: string) {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [key]: value } : li)));
  }

  function validate(): string | null {
    if (!invoiceDate) return "Invoice date is required";
    if (lineItems.some((li) => !li.cost_code || !li.amount)) return "Each line item needs a cost code and amount";
    if (lineItems.some((li) => isNaN(parseFloat(li.amount)) || parseFloat(li.amount) <= 0)) return "All amounts must be positive numbers";
    return null;
  }

  function handleSubmit() {
    const err = validate();
    if (err) { setSubmitError(err); return; }
    setSubmitError(null);

    const resolvedVendorName = vendorId ? (vendors.find((v) => v.id === vendorId)?.name ?? vendorName) : vendorName;
    const resolvedProjectName = selectedProject?.name ?? initial.project_name ?? "Company";

    const input: UpdateInvoiceInput = {
      project_id: projectId || null,
      vendor_id: vendorId || null,
      vendor_name: resolvedVendorName,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate,
      pending_draw: pendingDraw,
      status,
      payment_method: paymentMethod,
      contract_id: contractId || null,
      line_items: lineItems.map((li) => ({
        cost_code: li.cost_code,
        description: li.description,
        amount: parseFloat(li.amount),
      })),
      project_name: resolvedProjectName,
    };

    startTransition(async () => {
      const result = await updateInvoice(invoiceId, input);
      if (result.error) {
        setSubmitError(result.error);
      } else {
        router.push(`/invoices/${invoiceId}`);
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* AI confidence banner (read-only reminder) */}
      {initial.ai_confidence === "low" && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Low AI confidence — please review all fields</p>
            {initial.ai_notes && <p className="mt-0.5 text-amber-700">{initial.ai_notes}</p>}
          </div>
        </div>
      )}
      {initial.ai_confidence === "medium" && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
          <p className="font-medium">Medium AI confidence — verify extracted data</p>
        </div>
      )}

      {/* Invoice details */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Invoice Details</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Project">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={ic()}>
              <option value="">— G&A (no project) —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Vendor">
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={ic()}>
              <option value="">— Select or type below —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </Field>
        </div>

        {!vendorId && (
          <Field label="Vendor name (if not in list)">
            <input type="text" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Enter vendor name" className={ic()} />
          </Field>
        )}

        {contracts.length > 0 && (
          <Field label="Linked Contract">
            <select value={contractId} onChange={(e) => setContractId(e.target.value)} className={ic()}>
              <option value="">— No contract —</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · ${c.amount.toLocaleString()} · {c.status}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-3 gap-4">
          <Field label="Invoice Number">
            <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" className={ic()} />
          </Field>
          <Field label="Invoice Date" required>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={ic(!invoiceDate && !!submitError)} />
          </Field>
          <Field label="Due Date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={ic()} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={ic()}>
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="disputed">Disputed</option>
            </select>
          </Field>
          <Field label="Payment Method">
            <input
              type="text"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="e.g. Check, ACH, Wire"
              className={ic()}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={pendingDraw}
            onChange={(e) => setPendingDraw(e.target.checked)}
            className="w-4 h-4 rounded accent-[#4272EF]"
          />
          <span className="text-sm text-gray-700">Include in pending draw request</span>
        </label>
      </section>

      {/* Line items */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Line Items</h2>
          <span className="text-xs text-gray-400">
            Running total: <span className="font-medium text-gray-700">${lineTotal.toFixed(2)}</span>
          </span>
        </div>

        {relevantCodes.length === 0 && (
          <p className="text-xs text-amber-600 mb-3">
            {projectId
              ? "No cost codes found for this project type."
              : "No G&A cost codes (103–120) found in the system."}
          </p>
        )}

        <div className="space-y-2">
          <div className="grid grid-cols-[200px_1fr_120px_32px] gap-2 px-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Cost Code</span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Description</span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Amount</span>
            <span />
          </div>

          {lineItems.map((li, idx) => (
            <div key={idx} className="grid grid-cols-[200px_1fr_120px_32px] gap-2 items-center">
              <select value={li.cost_code} onChange={(e) => updateLine(idx, "cost_code", e.target.value)} className={ic(!li.cost_code && !!submitError)}>
                <option value="">— Select code —</option>
                {relevantCodes.map((cc) => (
                  <option key={cc.id} value={cc.code}>{cc.code} – {cc.name}</option>
                ))}
              </select>
              <input type="text" value={li.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="Description" className={ic()} />
              <input type="number" step="0.01" min="0" value={li.amount} onChange={(e) => updateLine(idx, "amount", e.target.value)} placeholder="0.00" className={ic(!li.amount && !!submitError)} />
              <button onClick={() => setLineItems((p) => p.filter((_, i) => i !== idx))} disabled={lineItems.length === 1} className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <button onClick={() => setLineItems((p) => [...p, { ...EMPTY_LINE }])} className="mt-3 flex items-center gap-1.5 text-sm text-[#4272EF] hover:text-[#3461de]">
          <Plus size={15} />
          Add line item
        </button>
      </section>

      {submitError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{submitError}</div>
      )}

      <div className="flex items-center justify-between pb-6">
        <button onClick={() => router.push(`/invoices/${invoiceId}`)} className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={isPending} className="px-6 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] disabled:opacity-60">
          {isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
