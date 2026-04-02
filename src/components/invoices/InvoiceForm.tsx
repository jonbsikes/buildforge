"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Info,
  X,
} from "lucide-react";
import { saveInvoice } from "@/app/actions/invoices";
import type { ExtractedInvoiceData } from "@/app/api/invoices/extract/route";
import { createClient } from "@/lib/supabase/client";

interface Vendor {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  project_type: "home_construction" | "land_development";
  address?: string | null;
  subdivision?: string | null;
  block?: string | null;
  lot?: string | null;
}

interface CostCode {
  id: string;
  code: string;
  name: string;
}

interface Props {
  vendors: Vendor[];
  projects: Project[];
  costCodes: CostCode[]; // all codes 1–120
}

interface LineItem {
  cost_code: string;
  description: string;
  amount: string;
}

const EMPTY_LINE: LineItem = { cost_code: "", description: "", amount: "" };

function getCodesForContext(
  projectType: "home_construction" | "land_development" | null,
  allCodes: CostCode[]
): CostCode[] {
  if (projectType === "home_construction") {
    return allCodes.filter((c) => {
      const n = parseInt(c.code, 10);
      return n >= 34 && n <= 102;
    });
  }
  if (projectType === "land_development") {
    return allCodes.filter((c) => {
      const n = parseInt(c.code, 10);
      return n >= 1 && n <= 33;
    });
  }
  // No project selected → show all codes so AI-suggested codes are always visible
  return allCodes;
}

type AiConfidence = "high" | "medium" | "low" | null;

export default function InvoiceForm({ vendors, projects, costCodes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF upload + AI state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<AiConfidence>(null);
  const [aiNotes, setAiNotes] = useState("");

  // Track if any field has been manually touched (for low-confidence lock)
  const [manuallyEdited, setManuallyEdited] = useState(false);

  // Project / context
  const [projectId, setProjectId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState(""); // free text fallback

  // Header fields
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...EMPTY_LINE }]);

  const [submitError, setSubmitError] = useState<string | null>(null);

  // Revoke blob URL on unmount or when file changes
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  // Derived context
  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const relevantCodes = getCodesForContext(
    selectedProject?.project_type ?? null,
    costCodes
  );

  // G&A enforcement: if any line item uses a G&A code (103–120), project must be null
  const hasGaCostCode = lineItems.some((li) => {
    const n = parseInt(li.cost_code, 10);
    return n >= 103 && n <= 120;
  });

  // Auto-clear project when G&A code is selected
  useEffect(() => {
    if (hasGaCostCode && projectId) {
      setProjectId("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGaCostCode]);

  // Running total from line items
  const lineTotal = lineItems.reduce((sum, li) => {
    const n = parseFloat(li.amount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  function markEdited() {
    if (!manuallyEdited) setManuallyEdited(true);
  }

  // PDF upload handler
  async function handleFileSelect(file: File) {
    setUploadedFile(file);
    setExtractionError(null);
    setIsExtracting(true);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? "anon";
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${uid}/${Date.now()}-${safeName}`;

      // Run storage upload + AI extraction in parallel
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projects", JSON.stringify(projects.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.project_type,
        address: p.address ?? null,
        subdivision: p.subdivision ?? null,
        block: p.block ?? null,
        lot: p.lot ?? null,
      }))));

      const [uploadResult, extractRes] = await Promise.allSettled([
        supabase.storage.from("invoices").upload(storagePath, file, { contentType: file.type }),
        fetch("/api/invoices/extract", { method: "POST", body: fd }).then((r) => r.json() as Promise<ExtractedInvoiceData & { error?: string }>),
      ]);

      // Save file path if upload succeeded
      if (uploadResult.status === "fulfilled" && uploadResult.value.data) {
        setUploadedFilePath(uploadResult.value.data.path);
      }

      // Handle extraction
      if (extractRes.status === "rejected") {
        setExtractionError("Could not reach extraction service");
        return;
      }
      const data = extractRes.value;
      if (data.error) {
        setExtractionError(data.error ?? "Extraction failed");
        return;
      }

      // Pre-fill form
      setVendorName(data.vendor ?? "");
      setInvoiceNumber(data.invoice_number ?? "");
      setInvoiceDate(data.invoice_date ?? "");
      setDueDate(data.due_date ?? "");
      setAiConfidence(data.ai_confidence ?? "low");
      setAiNotes(data.ai_notes ?? "");
      if (data.project_id) setProjectId(data.project_id);

      // Pre-fill line items
      if (data.line_items?.length > 0) {
        setLineItems(
          data.line_items.map((li) => ({
            cost_code: li.cost_code ?? "",
            description: li.description ?? "",
            amount: li.amount != null ? String(li.amount) : "",
          }))
        );
      }

      // Match vendor by name if possible
      const matchedVendor = vendors.find(
        (v) => v.name.toLowerCase() === (data.vendor ?? "").toLowerCase()
      );
      if (matchedVendor) setVendorId(matchedVendor.id);
    } catch {
      setExtractionError("Could not reach extraction service");
    } finally {
      setIsExtracting(false);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") handleFileSelect(file);
  }

  // Line item handlers
  function updateLine(idx: number, key: keyof LineItem, value: string) {
    markEdited();
    setLineItems((prev) =>
      prev.map((li, i) => (i === idx ? { ...li, [key]: value } : li))
    );
  }

  function addLine() {
    setLineItems((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(idx: number) {
    if (lineItems.length === 1) return; // keep at least one
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate(): string | null {
    if (!projectId && !vendorId && !vendorName.trim()) return "Select a vendor or enter a vendor name";
    if (!invoiceDate) return "Invoice date is required";
    if (lineItems.some((li) => !li.cost_code || !li.amount)) {
      return "Each line item needs a cost code and amount";
    }
    if (lineItems.some((li) => isNaN(parseFloat(li.amount)) || parseFloat(li.amount) <= 0)) {
      return "All line item amounts must be positive numbers";
    }
    return null;
  }

  function handleSubmit() {
    const err = validate();
    if (err) { setSubmitError(err); return; }
    setSubmitError(null);

    const resolvedVendorName =
      vendorId
        ? (vendors.find((v) => v.id === vendorId)?.name ?? vendorName)
        : vendorName;

    const parsedItems = lineItems.map((li) => ({
      cost_code: li.cost_code,
      description: li.description,
      amount: parseFloat(li.amount),
    }));

    startTransition(async () => {
      const result = await saveInvoice({
        project_id: projectId || null,
        vendor_id: vendorId || null,
        vendor_name: resolvedVendorName,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate,
        source: uploadedFile ? "upload" : "manual",
        file_path: uploadedFilePath,
        file_name_original: uploadedFile?.name ?? null,
        ai_confidence: aiConfidence ?? "high",
        ai_notes: aiNotes,
        line_items: parsedItems,
        project_name: selectedProject?.name ?? "Company",
      });

      if (result.error) {
        setSubmitError(result.error);
      } else if (result.invoiceId) {
        router.push(`/invoices/${result.invoiceId}`);
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* AI confidence warning */}
      {aiConfidence === "low" && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Low AI confidence — manual review required</p>
            {aiNotes && <p className="mt-0.5 text-amber-700">{aiNotes}</p>}
            <p className="mt-1 text-amber-700">
              Edit at least one field before this invoice can be approved.
            </p>
          </div>
        </div>
      )}
      {aiConfidence === "medium" && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
          <div>
            <p className="font-medium">Medium AI confidence — please verify extracted data</p>
            {aiNotes && <p className="mt-0.5">{aiNotes}</p>}
          </div>
        </div>
      )}

      {/* PDF Upload */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">PDF Invoice (optional)</h2>

        {!uploadedFile ? (
          <div
            onDrop={handleFileDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-[#4272EF] hover:bg-blue-50/30 transition-colors"
          >
            <Upload size={24} className="text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Drop a PDF here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">AI will extract all fields automatically</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
            {isExtracting ? (
              <Loader2 size={16} className="text-[#4272EF] animate-spin flex-shrink-0" />
            ) : aiConfidence === "high" ? (
              <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
            ) : (
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
            )}
            <span className="text-sm text-gray-700 flex-1 truncate">{uploadedFile.name}</span>
            {isExtracting && (
              <span className="text-xs text-gray-400">Extracting…</span>
            )}
            {!isExtracting && aiConfidence && (
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  aiConfidence === "high"
                    ? "bg-green-100 text-green-700"
                    : aiConfidence === "medium"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {aiConfidence} confidence
              </span>
            )}
            <button
              onClick={() => {
                setUploadedFile(null);
                setUploadedFilePath(null);
                setAiConfidence(null);
                setAiNotes("");
                if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {extractionError && (
          <p className="mt-2 text-xs text-red-600">{extractionError}</p>
        )}
      </section>

      {/* Context: Project + Vendor */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Invoice Details</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Project">
            <select
              value={hasGaCostCode ? "" : projectId}
              onChange={(e) => { markEdited(); setProjectId(e.target.value); }}
              disabled={hasGaCostCode}
              className={inputClass(false) + (hasGaCostCode ? " opacity-50 cursor-not-allowed" : "")}
              title={hasGaCostCode ? "G&A cost codes (103–120) cannot be assigned to a project" : undefined}
            >
              <option value="">— G&A (no project) —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Vendor">
            <select
              value={vendorId}
              onChange={(e) => { markEdited(); setVendorId(e.target.value); }}
              className={inputClass(false)}
            >
              <option value="">— Select or type below —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <a
              href={`/vendors/new${vendorName ? `?name=${encodeURIComponent(vendorName)}` : ""}`}
              className="inline-block mt-1 text-xs text-[#4272EF] hover:underline"
            >
              + Create new vendor
            </a>
          </Field>
        </div>

        {!vendorId && (
          <Field label="Vendor name (if not in list)">
            <input
              type="text"
              value={vendorName}
              onChange={(e) => { markEdited(); setVendorName(e.target.value); }}
              placeholder="Enter vendor name"
              className={inputClass(false)}
            />
          </Field>
        )}

        <div className="grid grid-cols-3 gap-4">
          <Field label="Invoice Number">
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => { markEdited(); setInvoiceNumber(e.target.value); }}
              placeholder="INV-001"
              className={inputClass(false)}
            />
          </Field>
          <Field label="Invoice Date" required>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => { markEdited(); setInvoiceDate(e.target.value); }}
              className={inputClass(!invoiceDate && !!submitError)}
            />
          </Field>
          <Field label="Due Date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => { markEdited(); setDueDate(e.target.value); }}
              className={inputClass(false)}
            />
          </Field>
        </div>
      </section>

      {/* Line Items */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Line Items</h2>
          <span className="text-xs text-gray-400">
            Running total:{" "}
            <span className="font-medium text-gray-700">
              ${lineTotal.toFixed(2)}
            </span>
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
          {/* Header row */}
          <div className="grid grid-cols-[200px_1fr_120px_32px] gap-2 px-1">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Cost Code</span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Description</span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Amount</span>
            <span />
          </div>

          {lineItems.map((li, idx) => (
            <div key={idx} className="grid grid-cols-[200px_1fr_120px_32px] gap-2 items-center">
              <select
                value={li.cost_code}
                onChange={(e) => updateLine(idx, "cost_code", e.target.value)}
                className={inputClass(!li.cost_code && !!submitError)}
              >
                <option value="">— Select code —</option>
                {relevantCodes.map((cc) => (
                  <option key={cc.id} value={cc.code}>
                    {cc.code} – {cc.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={li.description}
                onChange={(e) => updateLine(idx, "description", e.target.value)}
                placeholder="Description"
                className={inputClass(false)}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={li.amount}
                onChange={(e) => updateLine(idx, "amount", e.target.value)}
                placeholder="0.00"
                className={inputClass(!li.amount && !!submitError)}
              />
              <button
                onClick={() => removeLine(idx)}
                disabled={lineItems.length === 1}
                className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={addLine}
          className="mt-3 flex items-center gap-1.5 text-sm text-[#4272EF] hover:text-[#3461de] transition-colors"
        >
          <Plus size={15} />
          Add line item
        </button>
      </section>

      {/* Submit */}
      {submitError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between pb-6">
        <button
          onClick={() => router.push("/invoices")}
          className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending || isExtracting}
          className="px-6 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? "Saving…" : "Save Invoice"}
        </button>
      </div>

      {/* PDF Preview */}
      {previewUrl && uploadedFile && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">{uploadedFile.name}</h3>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#4272EF] hover:underline"
            >
              Open in new tab ↗
            </a>
          </div>
          <iframe
            src={previewUrl}
            title={uploadedFile.name}
            className="w-full border-0"
            style={{ height: 900 }}
          />
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] focus:border-transparent transition-colors ${
    hasError ? "border-red-400" : "border-gray-300"
  }`;
}
