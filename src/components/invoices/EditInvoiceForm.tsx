"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle, Info, Upload, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateInvoice, type UpdateInvoiceInput } from "@/app/actions/invoices";

interface Vendor { id: string; name: string }
interface Project { id: string; name: string; project_type: "home_construction" | "land_development" }
interface CostCode { id: string; code: string; name: string; project_type: "home_construction" | "land_development" | "general_admin" | null }
interface Contract { id: string; label: string; amount: number; status: string }

interface LineItem {
  project_id: string;
  cost_code: string;
  description: string;
  amount: string;
}

interface InitialData {
  vendor_id: string | null;
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  pending_draw: boolean;
  direct_cash_payment: boolean;
  status: string;
  payment_method: string | null;
  ai_confidence: string | null;
  ai_notes: string | null;
  contract_id: string | null;
  line_items: { project_id: string | null; cost_code: string; description: string | null; amount: number }[];
  project_name: string | null;
}

interface Props {
  invoiceId: string;
  initial: InitialData;
  vendors: Vendor[];
  projects: Project[];
  costCodes: CostCode[];
  contracts: Contract[];
  signedFileUrl: string | null;
  fileName: string | null;
}

const EMPTY_LINE: LineItem = { project_id: "", cost_code: "", description: "", amount: "" };

function getCodesForContext(
  projectType: "home_construction" | "land_development" | null,
  allCodes: CostCode[]
): CostCode[] {
  if (projectType === "home_construction") return allCodes.filter((c) => c.project_type === "home_construction");
  if (projectType === "land_development") return allCodes.filter((c) => c.project_type === "land_development");
  return allCodes;
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

export default function EditInvoiceForm({ invoiceId, initial, vendors, projects, costCodes, contracts, signedFileUrl, fileName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const hasExistingFile = !!signedFileUrl;

  const [contractId, setContractId] = useState(initial.contract_id ?? "");
  const [vendorId, setVendorId] = useState(initial.vendor_id ?? "");
  const [vendorName, setVendorName] = useState(initial.vendor ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(initial.invoice_number ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initial.invoice_date ?? "");
  const [dueDate, setDueDate] = useState(initial.due_date ?? "");
  const [pendingDraw, setPendingDraw] = useState(initial.pending_draw);
  const [directCashPayment, setDirectCashPayment] = useState(initial.direct_cash_payment ?? false);
  const [status, setStatus] = useState<"pending_review" | "approved" | "released" | "cleared" | "disputed" | "void">(
    (["approved", "released", "cleared", "disputed", "void"].includes(initial.status))
      ? initial.status as "approved" | "released" | "cleared" | "disputed" | "void"
      : "pending_review"
  );
  const [paymentMethod, setPaymentMethod] = useState(initial.payment_method ?? "");
  const [lineItems, setLineItems] = useState<LineItem[]>(
    initial.line_items.length > 0
      ? initial.line_items.map((li) => ({
          project_id: li.project_id ?? "",
          cost_code: li.cost_code,
          description: li.description ?? "",
          amount: String(li.amount),
        }))
      : [{ ...EMPTY_LINE }]
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Derive dominant project from the largest line item
  const dominantLine = lineItems.reduce((max, li) => {
    const a = parseFloat(li.amount) || 0;
    const b = parseFloat(max.amount) || 0;
    return a > b ? li : max;
  }, lineItems[0]);
  const dominantProject = projects.find((p) => p.id === dominantLine?.project_id) ?? null;

  // Per-line cost code filtering
  function getCodesForLine(lineProjectId: string): CostCode[] {
    const proj = projects.find((p) => p.id === lineProjectId);
    if (proj) return getCodesForContext(proj.project_type, costCodes);
    return costCodes.filter((c) => c.project_type === "general_admin");
  }

  // Detect Loan Interest cost codes (121/122) — shows the auto-draft toggle
  const hasLoanInterestCode = lineItems.some((li) => li.cost_code === "121" || li.cost_code === "122");

  // Auto-clear directCashPayment when Loan Interest code is removed
  useEffect(() => {
    if (!hasLoanInterestCode && directCashPayment) {
      setDirectCashPayment(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoanInterestCode]);

  // Auto-clear cost code when project changes on a line item
  function updateLineProject(idx: number, newProjectId: string) {
    setLineItems((prev) =>
      prev.map((li, i) => {
        if (i !== idx) return li;
        const proj = projects.find((p) => p.id === newProjectId);
        const codes = proj
          ? getCodesForContext(proj.project_type, costCodes)
          : costCodes.filter((c) => c.project_type === "general_admin");
        const codeStillValid = codes.some((c) => c.code === li.cost_code);
        return { ...li, project_id: newProjectId, cost_code: codeStillValid ? li.cost_code : "" };
      })
    );
  }

  const lineTotal = lineItems.reduce((sum, li) => {
    const n = parseFloat(li.amount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  function updateLine(idx: number, key: keyof LineItem, value: string) {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [key]: value } : li)));
  }

  function validate(): string | null {
    if (!vendorId) return "A vendor must be selected. Use '+ Create new vendor' if the vendor isn't listed.";
    if (!invoiceDate) return "Invoice date is required";
    if (lineItems.some((li) => !li.cost_code || !li.amount)) return "Each line item needs a cost code and amount";
    if (lineItems.some((li) => isNaN(parseFloat(li.amount)) || parseFloat(li.amount) <= 0)) return "All amounts must be positive numbers";
    return null;
  }

  function handleFileSelect(f: File | null) {
    if (!f) return;
    const isPdf = f.type.includes("pdf") || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) { setFileError("Only PDF files are supported."); return; }
    if (f.size > 20 * 1024 * 1024) { setFileError("File must be under 20MB."); return; }
    setFileError(null);
    setRemoveFile(false);
    setPendingFile(f);
  }

  function handleSubmit() {
    const err = validate();
    if (err) { setSubmitError(err); return; }
    setSubmitError(null);

    const resolvedVendorName = vendorId ? (vendors.find((v) => v.id === vendorId)?.name ?? vendorName) : vendorName;
    const resolvedProjectName = dominantProject?.name ?? initial.project_name ?? "Company";

    startTransition(async () => {
      // Upload new PDF first, if one was selected
      let newFilePath: string | null | undefined = undefined;
      if (pendingFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setSubmitError("Not authenticated"); return; }
        const fp = `${user.id}/${Date.now()}-${pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await supabase.storage
          .from("invoices")
          .upload(fp, pendingFile, { contentType: pendingFile.type || "application/pdf", upsert: false });
        if (uploadError) { setSubmitError(`File upload failed: ${uploadError.message}`); return; }
        newFilePath = fp;
      } else if (removeFile) {
        newFilePath = null;
      }

      const input: UpdateInvoiceInput = {
        vendor_id: vendorId, // mandatory — validated above
        vendor_name: resolvedVendorName,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate,
        pending_draw: pendingDraw && !directCashPayment,
        direct_cash_payment: directCashPayment,
        status,
        payment_method: paymentMethod,
        contract_id: contractId || null,
        line_items: lineItems.map((li) => ({
          cost_code: li.cost_code,
          description: li.description,
          amount: parseFloat(li.amount),
          project_id: li.project_id || null,
        })),
        project_name: resolvedProjectName,
        ...(newFilePath !== undefined ? { file_path: newFilePath } : {}),
      };

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

      {/* Attachment */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Attachment <span className="text-gray-400 font-normal">(optional)</span>
          </h2>
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)} />

        {pendingFile ? (
          <div className="flex items-center gap-3 px-3 py-2.5 border border-green-200 bg-green-50 rounded-lg">
            <FileText size={16} className="text-green-600 shrink-0" />
            <span className="flex-1 text-sm text-gray-800 truncate">{pendingFile.name}</span>
            <span className="text-xs text-gray-500">{(pendingFile.size / 1024).toFixed(0)} KB · will replace current</span>
            <button type="button" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              className="text-xs text-gray-400 hover:text-red-500">Cancel</button>
          </div>
        ) : hasExistingFile && !removeFile ? (
          <div className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 bg-gray-50 rounded-lg">
            <FileText size={16} className="text-gray-500 shrink-0" />
            <span className="flex-1 text-sm text-gray-800 truncate">{fileName ?? "Invoice PDF"}</span>
            <a href={signedFileUrl!} target="_blank" rel="noopener noreferrer"
              className="text-xs text-[#4272EF] hover:underline">Open ↗</a>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="text-xs text-[#4272EF] hover:underline">Replace</button>
            <button type="button" onClick={() => setRemoveFile(true)}
              className="text-xs text-gray-400 hover:text-red-500">Remove</button>
          </div>
        ) : hasExistingFile && removeFile ? (
          <div className="flex items-center gap-3 px-3 py-2.5 border border-red-200 bg-red-50 rounded-lg">
            <FileText size={16} className="text-red-400 shrink-0" />
            <span className="flex-1 text-sm text-red-700 line-through truncate">{fileName ?? "Invoice PDF"}</span>
            <span className="text-xs text-red-600">will be removed on save</span>
            <button type="button" onClick={() => setRemoveFile(false)}
              className="text-xs text-[#4272EF] hover:underline">Undo</button>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="text-xs text-[#4272EF] hover:underline">Upload new</button>
          </div>
        ) : (
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors">
            <Upload size={15} className="text-gray-400" />
            Attach invoice PDF (optional, up to 20MB)
          </button>
        )}
        {fileError && <p className="mt-2 text-xs text-red-600">{fileError}</p>}
      </section>

      {/* Invoice details */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Invoice Details</h2>

        <Field label="Vendor" required>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={ic(!vendorId && !!submitError)}>
            <option value="">— Select vendor —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams();
              params.set("returnTo", "invoice-edit");
              params.set("invoiceId", invoiceId);
              router.push(`/vendors/new?${params.toString()}`);
            }}
            className="inline-block mt-1 text-xs text-[#4272EF] hover:underline"
          >
            + Create new vendor
          </button>
        </Field>


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
              <option value="released">Released</option>
              <option value="cleared">Cleared</option>
              <option value="disputed">Disputed</option>
              <option value="void">Void</option>
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
            checked={pendingDraw && !directCashPayment}
            onChange={(e) => setPendingDraw(e.target.checked)}
            disabled={directCashPayment}
            className="w-4 h-4 rounded accent-[#4272EF] disabled:opacity-40"
          />
          <span className={`text-sm ${directCashPayment ? "text-gray-400" : "text-gray-700"}`}>
            Include in pending draw request
          </span>
        </label>

        {/* Auto-draft toggle — only shown when a Loan Interest cost code is on any line item */}
        {hasLoanInterestCode && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mt-3">
            <input
              type="checkbox"
              id="directCashPaymentEdit"
              checked={directCashPayment}
              onChange={(e) => {
                setDirectCashPayment(e.target.checked);
                if (e.target.checked) setPendingDraw(false);
              }}
              className="mt-0.5 w-4 h-4 rounded border-blue-300 accent-[#4272EF]"
            />
            <label htmlFor="directCashPaymentEdit" className="cursor-pointer select-none">
              <span className="text-sm font-medium text-blue-900">Bank auto-drafts from operating account</span>
              <p className="text-xs text-blue-700 mt-0.5">
                On approval, posts DR WIP/CIP / CR Cash directly — skips AP and draw. Payment date set to today.
              </p>
            </label>
          </div>
        )}
      </section>

      {/* Line items */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Line Items</h2>
          <span className="text-xs text-gray-400">
            Running total: <span className="font-medium text-gray-700">${lineTotal.toFixed(2)}</span>
          </span>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[180px_180px_1fr_110px_32px] gap-2 px-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Project</span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Cost Code</span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Description</span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Amount</span>
            <span />
          </div>

          {lineItems.map((li, idx) => {
            const lineCodes = getCodesForLine(li.project_id);
            return (
              <div key={idx} className="grid grid-cols-[180px_180px_1fr_110px_32px] gap-2 items-center">
                <select
                  value={li.project_id}
                  onChange={(e) => updateLineProject(idx, e.target.value)}
                  className={ic()}
                >
                  <option value="">— G&A —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select value={li.cost_code} onChange={(e) => updateLine(idx, "cost_code", e.target.value)} className={ic(!li.cost_code && !!submitError)}>
                  <option value="">— Code —</option>
                  {lineCodes.map((cc) => (
                    <option key={cc.id} value={cc.code}>{cc.code} – {cc.name}</option>
                  ))}
                </select>
                <input type="text" value={li.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="Description" className={ic()} />
                <input type="number" step="0.01" min="0" value={li.amount} onChange={(e) => updateLine(idx, "amount", e.target.value)} placeholder="0.00" className={ic(!li.amount && !!submitError)} />
                <button onClick={() => setLineItems((p) => p.filter((_, i) => i !== idx))} disabled={lineItems.length === 1} className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
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

      {/* PDF Preview */}
      {signedFileUrl && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">{fileName ?? "Invoice File"}</h3>
            <a
              href={signedFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#4272EF] hover:underline"
            >
              Open in new tab ↗
            </a>
          </div>
          <iframe
            src={signedFileUrl}
            title={fileName ?? "Invoice"}
            className="w-full border-0"
            style={{ height: 900 }}
          />
        </div>
      )}
    </div>
  );
}
