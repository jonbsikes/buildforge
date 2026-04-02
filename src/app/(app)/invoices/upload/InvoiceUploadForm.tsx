"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowLeft, Upload, FileText, Sparkles, Loader2,
  CheckCircle2, XCircle, AlertTriangle, X,
} from "lucide-react";

interface CostCode { code: number; category: string; description: string; }
interface Project { id: string; name: string; project_type: string; }
interface Props { projects: Project[]; costCodes: CostCode[]; hasAI: boolean; }

type SingleStep = "upload" | "extracting" | "review";

type BatchStatus = "queued" | "uploading" | "extracting" | "done" | "error";
interface BatchItem {
  file: File;
  status: BatchStatus;
  error?: string;
  invoiceId?: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function isPDF(f: File) {
  return f.type.includes("pdf") || f.name.toLowerCase().endsWith(".pdf");
}

function fileSizeOk(f: File) {
  return f.size <= 20 * 1024 * 1024;
}

const MULTI_PROJECT = "__multiple__";

async function uploadAndExtract(
  supabase: ReturnType<typeof createClient>,
  file: File,
  projectId: string,
  hasAI: boolean,
  userId: string,
  allProjects?: { id: string; name: string }[],
) {
  // 1. Upload to storage
  const filePath = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage
    .from("invoices")
    .upload(filePath, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const isMulti = projectId === MULTI_PROJECT;

  // 2. Create invoice record (project_id filled in after extraction for multi-project mode)
  const { data: invoice, error: insertError } = await supabase
    .from("invoices")
    .insert({
      project_id: isMulti ? null : (projectId || null),
      file_path: filePath,
      file_name: file.name,
      processed: false,
      status: "pending_review",
      source: "upload",
    })
    .select("id")
    .single();
  if (insertError || !invoice) throw new Error(`DB error: ${insertError?.message}`);

  if (!hasAI) return { invoiceId: invoice.id, extracted: null };

  // 3. AI extraction
  const fd = new FormData();
  fd.append("file", file);
  if (isMulti && allProjects?.length) {
    fd.append("projects", JSON.stringify(allProjects.map((p) => ({ id: p.id, name: p.name }))));
  }
  const res = await fetch("/api/invoices/extract", { method: "POST", body: fd });
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  // 4. Update invoice with extracted data (use AI-assigned project_id in multi mode)
  const resolvedProjectId = isMulti ? (data.project_id || null) : (projectId || null);
  await supabase.from("invoices").update({
    project_id: resolvedProjectId,
    vendor: data.vendor || null,
    invoice_number: data.invoice_number || null,
    invoice_date: data.invoice_date || null,
    due_date: data.due_date || null,
    amount: data.total_amount || null,
    total_amount: data.total_amount || null,
    cost_code: data.line_items?.[0]?.cost_code ? parseInt(data.line_items[0].cost_code) : null,
    ai_notes: data.ai_notes || null,
    ai_confidence: data.ai_confidence || null,
    processed: true,
  }).eq("id", invoice.id);

  if (data.line_items?.length) {
    await supabase.from("invoice_line_items").insert(
      data.line_items.map((li: { cost_code: string; description: string; amount: number }) => ({
        invoice_id: invoice.id,
        cost_code: li.cost_code ? parseInt(li.cost_code) : null,
        description: li.description || "",
        amount: li.amount || 0,
      }))
    );
  }

  return { invoiceId: invoice.id, extracted: data };
}

// ─── Single-file upload flow ─────────────────────────────────────────────────

function SingleUpload({ projects, costCodes, hasAI }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<SingleStep>("upload");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<{ cost_code: number | null; description: string; amount: number }[]>([]);
  const [form, setForm] = useState({
    project_id: projects[0]?.id ?? "",
    cost_code: "",
    vendor: "",
    invoice_number: "",
    invoice_date: "",
    amount: "",
    due_date: "",
    ai_notes: "",
    ai_confidence: "",
  });

  function setField(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const handleFile = useCallback((f: File) => {
    if (!isPDF(f)) { setError("Only PDF files are supported."); return; }
    if (!fileSizeOk(f)) { setError("File must be under 20MB."); return; }
    setError(null);
    setFile(f);
  }, []);

  async function handleUpload() {
    if (!file || !form.project_id) return;
    setUploading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const filePath = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(filePath, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) { setError(`Upload failed: ${uploadError.message}`); setUploading(false); return; }

    const { data: invoice, error: insertError } = await supabase
      .from("invoices")
      .insert({ project_id: form.project_id, file_path: filePath, file_name: file.name, processed: false, status: "pending_review", source: "upload" })
      .select("id")
      .single();
    if (insertError || !invoice) { setError(`Database error: ${insertError?.message}`); setUploading(false); return; }

    setInvoiceId(invoice.id);
    setUploading(false);

    if (hasAI) {
      setStep("extracting");
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/invoices/extract", { method: "POST", body: fd });
        const data = await res.json();
        if (data && !data.error) {
          setForm((f) => ({
            ...f,
            vendor: data.vendor ?? "",
            invoice_number: data.invoice_number ?? "",
            invoice_date: data.invoice_date ?? "",
            due_date: data.due_date ?? "",
            amount: data.total_amount != null ? String(data.total_amount) : "",
            cost_code: data.line_items?.[0]?.cost_code ?? "",
            ai_notes: data.ai_notes ?? "",
            ai_confidence: data.ai_confidence ?? "",
          }));
          if (data.line_items?.length) setLineItems(data.line_items);
          // Update the invoice record with extracted data
          await supabase.from("invoices").update({
            vendor: data.vendor || null,
            invoice_number: data.invoice_number || null,
            invoice_date: data.invoice_date || null,
            due_date: data.due_date || null,
            amount: data.total_amount || null,
            total_amount: data.total_amount || null,
            cost_code: data.line_items?.[0]?.cost_code ? parseInt(data.line_items[0].cost_code) : null,
            ai_notes: data.ai_notes || null,
            ai_confidence: data.ai_confidence || null,
          }).eq("id", invoice.id);
        }
      } catch {
        // extraction failed — proceed to manual review
      }
    }

    setStep("review");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId) return;
    setSaving(true);
    await supabase.from("invoices").update({
      vendor: form.vendor || null,
      invoice_number: form.invoice_number || null,
      invoice_date: form.invoice_date || null,
      amount: parseFloat(form.amount) || null,
      total_amount: parseFloat(form.amount) || null,
      due_date: form.due_date || null,
      cost_code: form.cost_code ? parseInt(form.cost_code) : null,
      ai_notes: form.ai_notes || null,
      ai_confidence: (form.ai_confidence as "high" | "medium" | "low") || null,
      processed: true,
      status: "pending_review",
    }).eq("id", invoiceId);
    if (lineItems.length > 0) {
      await supabase.from("invoice_line_items").insert(
        lineItems.map((li) => ({ invoice_id: invoiceId, cost_code: li.cost_code ? String(li.cost_code) : null, description: li.description || "", amount: li.amount || 0 }))
      );
    }
    router.push("/invoices");
  }

  const landCodes = costCodes.filter((c) => c.code >= 1 && c.code <= 33);
  const homeCodes = costCodes.filter((c) => c.code >= 34 && c.code <= 102);
  const gaCodes = costCodes.filter((c) => c.code >= 103 && c.code <= 120);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Steps */}
      <div className="flex items-center gap-2 mb-6">
        {(["upload", "extracting", "review"] as SingleStep[]).map((s, i) => {
          const done = (step === "review" && s !== "review") || (step === "extracting" && s === "upload");
          const active = step === s;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-8 ${done ? "bg-[#4272EF]" : "bg-gray-200"}`} />}
              <div className={`flex items-center gap-1.5 text-xs font-medium ${active ? "text-[#4272EF]" : done ? "text-green-600" : "text-gray-400"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${active ? "bg-[#4272EF] text-white" : done ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                  {done ? <CheckCircle2 size={12} /> : i + 1}
                </div>
                {["Upload", "Extract", "Review"][i]}
              </div>
            </div>
          );
        })}
      </div>

      {step === "upload" && (
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Upload Invoice PDF</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project <span className="text-red-500">*</span></label>
            <select value={form.project_id} onChange={(e) => setField("project_id", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
              <option value="">Select project…</option>
              <option value="">— G&A (no project) —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? "border-[#4272EF] bg-blue-50" : file ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-gray-400"}`}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText size={36} className="text-green-500" />
                <p className="font-medium text-gray-800">{file.name}</p>
                <p className="text-sm text-gray-400">{(file.size / 1024).toFixed(0)} KB · Click to change</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={36} className="text-gray-400" />
                <p className="font-medium text-gray-700">Drop a PDF here, or click to browse</p>
                <p className="text-sm text-gray-400">PDF up to 20MB</p>
              </div>
            )}
          </div>
          {hasAI && (
            <div className="flex items-center gap-2 bg-blue-50 text-[#4272EF] text-sm px-4 py-2.5 rounded-lg">
              <Sparkles size={15} />
              AI will extract details and assign a cost code automatically.
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button onClick={handleUpload} disabled={!file || !form.project_id || uploading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: "#4272EF" }}>
            {uploading ? <><Loader2 size={16} className="animate-spin" /> Uploading…</> : "Upload & Continue"}
          </button>
        </div>
      )}

      {step === "extracting" && (
        <div className="py-12 text-center">
          <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: "#4272EF" }} />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Reading invoice…</h2>
          <p className="text-gray-500 text-sm">AI is extracting details and assigning a cost code.</p>
        </div>
      )}

      {step === "review" && (
        <form onSubmit={handleSave} className="space-y-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Review & Save</h2>
            {form.ai_confidence && (
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                form.ai_confidence === "high" ? "text-green-700 bg-green-50" :
                form.ai_confidence === "medium" ? "text-amber-700 bg-amber-50" :
                "text-red-700 bg-red-50"}`}>
                <Sparkles size={11} /> AI {form.ai_confidence} confidence
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <input type="text" value={form.vendor} onChange={(e) => setField("vendor", e.target.value)}
                placeholder="e.g. ABC Concrete"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
              <input type="text" value={form.invoice_number} onChange={(e) => setField("invoice_number", e.target.value)}
                placeholder="e.g. INV-0042"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
              <input type="date" value={form.invoice_date} onChange={(e) => setField("invoice_date", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setField("amount", e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setField("due_date", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${form.ai_confidence === "low" ? "text-red-600" : "text-gray-700"}`}>
                Cost Code {form.ai_confidence === "low" && "(⚠ review required)"}
              </label>
              <select value={form.cost_code} onChange={(e) => setField("cost_code", e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] ${form.ai_confidence === "low" ? "border-red-400" : "border-gray-300"}`}>
                <option value="">— Select cost code —</option>
                <optgroup label="Land Development (1–33)">
                  {landCodes.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
                </optgroup>
                <optgroup label="Home Construction (34–102)">
                  {homeCodes.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
                </optgroup>
                <optgroup label="General & Administrative (103–120)">
                  {gaCodes.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
                </optgroup>
              </select>
            </div>
          </div>
          {lineItems.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Line Items ({lineItems.length})</label>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Code</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-800">{li.cost_code}</td>
                        <td className="px-3 py-2 text-gray-600">{li.description}</td>
                        <td className="px-3 py-2 text-right text-gray-800">${li.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {form.ai_notes && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
              <span className="font-medium text-gray-700">AI note: </span>{form.ai_notes}
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: "#4272EF" }}>
              {saving ? "Saving…" : "Save Invoice"}
            </button>
            <Link href="/invoices" className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Batch upload flow ───────────────────────────────────────────────────────

const STATUS_ICON: Record<BatchStatus, React.ReactNode> = {
  queued:     <div className="w-4 h-4 rounded-full border-2 border-gray-300" />,
  uploading:  <Loader2 size={16} className="animate-spin text-[#4272EF]" />,
  extracting: <Loader2 size={16} className="animate-spin text-amber-500" />,
  done:       <CheckCircle2 size={16} className="text-green-500" />,
  error:      <XCircle size={16} className="text-red-500" />,
};

const STATUS_LABEL: Record<BatchStatus, string> = {
  queued:     "Queued",
  uploading:  "Uploading…",
  extracting: "Extracting…",
  done:       "Done",
  error:      "Error",
};

function BatchUpload({ projects, hasAI }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [projectId, setProjectId] = useState(MULTI_PROJECT);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFiles(files: FileList | File[]) {
    const valid: File[] = [];
    const errs: string[] = [];
    Array.from(files).forEach((f) => {
      if (!isPDF(f)) errs.push(`${f.name}: not a PDF`);
      else if (!fileSizeOk(f)) errs.push(`${f.name}: over 20MB`);
      else valid.push(f);
    });
    if (errs.length) setError(errs.join("; "));
    else setError(null);
    if (valid.length) setItems((prev) => [...prev, ...valid.map((f) => ({ file: f, status: "queued" as BatchStatus }))]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, patch: Partial<BatchItem>) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  async function handleRun() {
    if (!items.length) return;
    setRunning(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === "done") continue;

      updateItem(i, { status: "uploading" });
      try {
        updateItem(i, { status: hasAI ? "extracting" : "uploading" });
        const { invoiceId } = await uploadAndExtract(supabase, item.file, projectId, hasAI, user.id, projects);
        updateItem(i, { status: "done", invoiceId });
      } catch (err) {
        updateItem(i, { status: "error", error: (err as Error).message });
      }
    }

    setRunning(false);
    setDone(true);
  }

  const allDone = items.length > 0 && items.every((it) => it.status === "done" || it.status === "error");
  const doneCount = items.filter((it) => it.status === "done").length;
  const errorCount = items.filter((it) => it.status === "error").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Batch Upload</h2>

      {!running && !done && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project (applies to all)</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
              <option value={MULTI_PROJECT}>Multiple Projects — AI will assign each invoice</option>
              <option value="">— G&A (no project) —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragging ? "border-[#4272EF] bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)} />
            <Upload size={32} className="text-gray-400 mx-auto mb-2" />
            <p className="font-medium text-gray-700">Drop PDFs here, or click to browse</p>
            <p className="text-sm text-gray-400 mt-1">Select multiple files · PDFs up to 20MB each</p>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase">{items.length} file{items.length !== 1 ? "s" : ""} selected</p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <FileText size={16} className="text-gray-400 shrink-0" />
                    <span className="flex-1 text-sm text-gray-800 truncate">{item.file.name}</span>
                    <span className="text-xs text-gray-400">{(item.file.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasAI && items.length > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 text-[#4272EF] text-sm px-4 py-2.5 rounded-lg">
              <Sparkles size={15} />
              {projectId === MULTI_PROJECT
                ? "AI will extract details and attempt to assign each invoice to the correct project."
                : "AI will extract details from each invoice automatically. Review them on the AP page after upload."}
            </div>
          )}

          <button onClick={handleRun} disabled={items.length === 0}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: "#4272EF" }}>
            Upload {items.length > 0 ? `${items.length} Invoice${items.length !== 1 ? "s" : ""}` : "Invoices"}
          </button>
        </>
      )}

      {(running || done) && (
        <div className="space-y-4">
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <div className="shrink-0">{STATUS_ICON[item.status]}</div>
                <span className="flex-1 text-sm text-gray-800 truncate">{item.file.name}</span>
                <span className={`text-xs font-medium ${
                  item.status === "done" ? "text-green-600" :
                  item.status === "error" ? "text-red-500" :
                  item.status === "queued" ? "text-gray-400" :
                  "text-[#4272EF]"
                }`}>{STATUS_LABEL[item.status]}</span>
                {item.status === "error" && item.error && (
                  <span className="text-xs text-red-400 max-w-[160px] truncate" title={item.error}>{item.error}</span>
                )}
              </div>
            ))}
          </div>

          {allDone && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${errorCount > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
              {errorCount > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              {doneCount} uploaded successfully{errorCount > 0 ? `, ${errorCount} failed` : ""}.
            </div>
          )}

          {allDone && (
            <button onClick={() => router.push("/invoices")}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "#4272EF" }}>
              Go to Accounts Payable
            </button>
          )}

          {!allDone && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" />
              Processing {items.filter((it) => it.status === "uploading" || it.status === "extracting").length > 0
                ? items.find((it) => it.status === "uploading" || it.status === "extracting")?.file.name
                : ""}…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function InvoiceUploadForm(props: Props) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"single" | "batch">(
    searchParams.get("mode") === "batch" ? "batch" : "single"
  );

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <Link href="/invoices" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Accounts Payable
        </Link>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          <button
            onClick={() => setMode("single")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "single" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Single Invoice
          </button>
          <button
            onClick={() => setMode("batch")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "batch" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            Batch Upload
          </button>
        </div>

        {mode === "single" ? <SingleUpload {...props} /> : <BatchUpload {...props} />}
      </div>
    </main>
  );
}
