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
import type { ExtractedInvoiceData, ExtractedInvoiceResponse } from "@/app/api/invoices/extract/route";
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
  project_type: "home_construction" | "land_development" | "general_admin" | null;
}

interface Props {
  vendors: Vendor[];
  projects: Project[];
  costCodes: CostCode[]; // all master cost codes
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
    return allCodes.filter((c) => c.project_type === "home_construction");
  }
  if (projectType === "land_development") {
    return allCodes.filter((c) => c.project_type === "land_development");
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
  const [status, setStatus] = useState<"pending_review" | "approved" | "released" | "cleared" | "disputed" | "void">("pending_review");
  const [pendingDraw, setPendingDraw] = useState(false);
  const [directCashPayment, setDirectCashPayment] = useState(false);

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([{ ...EMPTY_LINE }]);

  const [submitError, setSubmitError] = useState<string | null>(null);

  // Revoke blob URL on unmount or when file changes
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  // Restore form state when returning from vendor creation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedVendorId = params.get("vendorId");
    const saved = sessionStorage.getItem("invoice_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.projectId) setProjectId(draft.projectId);
        if (draft.vendorName) setVendorName(draft.vendorName);
        if (draft.invoiceNumber) setInvoiceNumber(draft.invoiceNumber);
        if (draft.invoiceDate) setInvoiceDate(draft.invoiceDate);
        if (draft.dueDate) setDueDate(draft.dueDate);
        if (draft.lineItems?.length) setLineItems(draft.lineItems);
        if (draft.aiConfidence) setAiConfidence(draft.aiConfidence);
        if (draft.aiNotes) setAiNotes(draft.aiNotes);
      } catch {}
      sessionStorage.removeItem("invoice_draft");
    }
    if (returnedVendorId) {
      setVendorId(returnedVendorId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived context
  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const relevantCodes = getCodesForContext(
    selectedProject?.project_type ?? null,
    costCodes
  );

  // G&A enforcement: if any line item uses a G&A cost code, project must be null
  const hasGaCostCode = lineItems.some((li) => {
    const found = costCodes.find((c) => c.code === li.cost_code);
    return found?.project_type === "general_admin";
  });

  // Detect Loan Interest cost codes (121/122) — shows the auto-draft toggle
  const hasLoanInterestCode = lineItems.some((li) => li.cost_code === "121" || li.cost_code === "122");

  // Auto-clear project when G&A code is selected
  useEffect(() => {
    if (hasGaCostCode && projectId) {
      setProjectId("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGaCostCode]);

  // Auto-clear directCashPayment and pendingDraw when Loan Interest code is removed
  useEffect(() => {
    if (!hasLoanInterestCode && directCashPayment) {
      setDirectCashPayment(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoanInterestCode]);

  // Running total from line items
  const lineTotal = lineItems.reduce((sum, li) => {
    const n = parseFloat(li.amount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  function markEdited() {
    if (!manuallyEdited) setManuallyEdited(true);
  }

  const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];

  // PDF / image upload handler
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
        fetch("/api/invoices/extract", { method: "POST", body: fd }).then((r) => r.json() as Promise<(ExtractedInvoiceResponse & { error?: string }) | { error: string }>),
      ]);

      // Save file path if upload succeeded
      if (uploadResult.status === "fulfilled" && uploadResult.value.data) {
        setUploadedFilePath(uploadResult.value.data.path);
      }

      // Handle extraction — if it fails, the file is still uploaded and the form is usable
      if (extractRes.status === "rejected") {
        setExtractionError("AI extraction unavailable — file uploaded. Fill in the details manually.");
        return;
      }
      const data = extractRes.value;
      if (data.error) {
        setExtractionError(`AI extraction failed: ${data.error ?? "Unknown error"}. File uploaded — fill in the details manually.`);
        return;
      }

      // Use first invoice from the array response
      const inv: ExtractedInvoiceData | undefined = "invoices" in data ? data.invoices?.[0] : undefined;
      if (!inv) {
        setExtractionError("AI extraction returned no data. File uploaded — fill in the details manually.");
        return;
      }

      // Warn if PDF had multiple invoices (use the upload page to import all)
      if ("invoices" in data && data.invoices.length > 1) {
        setAiNotes(`Note: this PDF contained ${data.invoices.length} invoices. Only the first was pre-filled here. Use the Upload page to import all of them.`);
      }

      // Pre-fill form
      setVendorName(inv.vendor ?? "");
      setInvoiceNumber(inv.invoice_number ?? "");
      setInvoiceDate(inv.invoice_date ?? "");
      setDueDate(inv.due_date ?? "");
      setAiConfidence(inv.ai_confidence ?? "low");
      if (!("invoices" in data && data.invoices.length > 1)) setAiNotes(inv.ai_notes ?? "");
      if (inv.project_id) setProjectId(inv.project_id);

      // Pre-fill line items
      if (inv.line_items?.length > 0) {
        setLineItems(
          inv.line_items.map((li) => ({
            cost_code: li.cost_code ?? "",
            description: li.description ?? "",
            amount: li.amount != null ? String(li.amount) : "",
          }))
        );
      }

      // Match vendor by name if possible
      const matchedVendor = vendors.find(
        (v) => v.name.toLowerCase() === (inv.vendor ?? "").toLowerCase()
      );
      if (matchedVendor) setVendorId(matchedVendor.id);
    } catch {
      setExtractionError("AI extraction unavailable — file uploaded. Fill in the details manually.");
    } finally {
      setIsExtracting(false);
    }
  }

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    setDropError(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (ACCEPTED_TYPES.includes(file.type)) {
      handleFileSelect(file);
    } else {
      setDropError("Unsupported file type. Please use PDF, PNG, JPG, or WebP.");
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
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
    if (!vendorId) return "A vendor must be selected. Use '+ Create new vendor' if the vendor isn't listed.";
    if (!invoiceDate) return "Invoice date is required";
    if (lineItems.some((li) => !li.cost_code || !li.amount)) {
      return "Each line item needs a cost code and amount";
    }
    if (lineItems.some((li) => isNaN(parseFloat(li.amount)) || parseFloat(li.amount) <= 0)) {
      return "All line item amounts must be positive numbers";
    }
    // Enforce 7-day minimum due date
    if (invoiceDate && dueDate) {
      const minDue = new Date(invoiceDate + "T00:00:00");
      minDue.setDate(minDue.getDate() + 7);
      if (new Date(dueDate + "T00:00:00") < minDue) {
        return "Due date must be at least 7 days after the invoice date";
      }
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
        vendor_id: vendorId, // mandatory — validated above
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
        status,
        pending_draw: pendingDraw && !directCashPayment,
        direct_cash_payment: directCashPayment,
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
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-[#4272EF] bg-blue-50/50 ring-2 ring-[#4272EF]/20"
                : "border-gray-200 hover:border-[#4272EF] hover:bg-blue-50/30"
            }`}
          >
            <Upload size={24} className={`mx-auto mb-2 ${isDragging ? "text-[#4272EF]" : "text-gray-400"}`} />
            <p className="text-sm text-gray-500">
              {isDragging ? "Drop file here" : "Drag & drop a file here, or click to browse"}
            </p>
            <p className="text-xs text-gray-400 mt-1">PDF or image — AI will extract all fields automatically</p>
            {dropError && <p className="text-xs text-red-600 mt-2">{dropError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
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
          <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
            <p className="text-xs text-amber-700">{extractionError}</p>
          </div>
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
              title={hasGaCostCode ? "G&A cost codes cannot be assigned to a project" : undefined}
            >
              <option value="">— G&A (no project) —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Vendor" required>
            <select
              value={vendorId}
              onChange={(e) => { markEdited(); setVendorId(e.target.value); }}
              className={inputClass(!vendorId && !!submitError)}
            >
              <option value="">— Select vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem("invoice_draft", JSON.stringify({
                  projectId, vendorName, invoiceNumber, invoiceDate, dueDate,
                  lineItems, aiConfidence, aiNotes,
                }));
                const params = new URLSearchParams();
                if (vendorName) params.set("name", vendorName);
                params.set("returnTo", "invoice");
                router.push(`/vendors/new?${params.toString()}`);
              }}
              className="inline-block mt-1 text-xs text-[#4272EF] hover:underline"
            >
              + Create new vendor
            </button>
          </Field>
        </div>

        {/* Vendor name free-text removed — vendor must be selected from the dropdown for 1099 accuracy */}

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
              min={invoiceDate ? (() => { const d = new Date(invoiceDate + "T00:00:00"); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })() : undefined}
              className={inputClass(false)}
            />
            <p className="text-xs text-gray-500 mt-1">Minimum 7 days after invoice date</p>
          </Field>
        </div>

        <div className="flex items-end gap-6">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className={inputClass(false)}
            >
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="released">Released</option>
              <option value="cleared">Cleared</option>
              <option value="disputed">Disputed</option>
              <option value="void">Void</option>
            </select>
          </Field>

          <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pendingDraw && !directCashPayment}
              onChange={(e) => setPendingDraw(e.target.checked)}
              disabled={directCashPayment}
              className="w-4 h-4 rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF] disabled:opacity-40"
            />
            <span className={`text-sm font-medium ${directCashPayment ? "text-gray-400" : "text-gray-700"}`}>
              Include in draw request
            </span>
          </label>
        </div>

        {/* Auto-draft toggle — only shown when a Loan Interest cost code is present */}
        {hasLoanInterestCode && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <input
              type="checkbox"
              id="directCashPayment"
              checked={directCashPayment}
              onChange={(e) => {
                setDirectCashPayment(e.target.checked);
                if (e.target.checked) setPendingDraw(false);
              }}
              className="mt-0.5 w-4 h-4 rounded border-blue-300 text-[#4272EF] focus:ring-[#4272EF]"
            />
            <label htmlFor="directCashPayment" className="cursor-pointer select-none">
              <span className="text-sm font-medium text-blue-900">Bank auto-drafts from operating account</span>
              <p className="text-xs text-blue-700 mt-0.5">
                On approval, posts DR WIP/CIP / CR Cash directly — skips AP and draw. Payment date set to today.
              </p>
            </label>
          </div>
        )}
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
              : "No G&A cost codes found in the system."}
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
          {uploadedFile.type === "application/pdf" ? (
            <iframe
              src={previewUrl}
              title={uploadedFile.name}
              className="w-full border-0"
              style={{ height: 900 }}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl}
              alt={uploadedFile.name}
              className="w-full max-h-[900px] object-contain p-4"
            />
          )}
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
