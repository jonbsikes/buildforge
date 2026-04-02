"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, Upload, FileText, Sparkles, Loader2, CheckCircle2 } from "lucide-react";

interface CostCode { code: number; category: string; description: string; }
interface Project { id: string; name: string; project_type: string; }

interface Props {
  projects: Project[];
  costCodes: CostCode[];
  hasAI: boolean;
}

type Step = "upload" | "extracting" | "review";

export default function InvoiceUploadForm({ projects, costCodes, hasAI }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  const [lineItems, setLineItems] = useState<{ cost_code: string; description: string; amount: number }[]>([]);

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
    const isPDF = f.type.includes("pdf") || f.name.toLowerCase().endsWith(".pdf");
    if (!isPDF) { setError("Only PDF files are supported."); return; }
    if (f.size > 20 * 1024 * 1024) { setError("File must be under 20MB."); return; }
    setError(null);
    setFile(f);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

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

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data: invoice, error: insertError } = await supabase
      .from("invoices")
      .insert({
        project_id: form.project_id,
        file_path: filePath,
        file_name: file.name,
        processed: false,
        status: "pending_review",
        source: "upload",
      })
      .select("id")
      .single();

    if (insertError || !invoice) {
      setError(`Database error: ${insertError?.message}`);
      setUploading(false);
      return;
    }

    setInvoiceId(invoice.id);
    setUploading(false);

    if (hasAI) {
      setStep("extracting");
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/invoices/extract", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (data && !data.error) {
          // Map API response fields to form state
          const primaryCode = data.line_items?.[0]?.cost_code ?? "";
          setForm((f) => ({
            ...f,
            vendor: data.vendor ?? "",
            invoice_number: data.invoice_number ?? "",
            invoice_date: data.invoice_date ?? "",
            due_date: data.due_date ?? "",
            amount: data.total_amount != null ? String(data.total_amount) : "",
            cost_code: primaryCode,
            ai_notes: data.ai_notes ?? "",
            ai_confidence: data.ai_confidence ?? "",
          }));
          // Store line items for saving
          if (data.line_items?.length) {
            setLineItems(data.line_items);
          }
        }
      } catch {
        // Extraction failed — proceed to review with empty fields
      }
    }

    setStep("review");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId) return;
    setSaving(true);
    setError(null);

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

    // Save line items if AI extracted them
    if (lineItems.length > 0) {
      const rows = lineItems.map((li) => ({
        invoice_id: invoiceId,
        cost_code: parseInt(li.cost_code) || null,
        description: li.description || "",
        amount: li.amount || 0,
      }));
      await supabase.from("invoice_line_items").insert(rows);
    }

    router.push("/invoices");
  }

  const landCodes = costCodes.filter((c) => c.code >= 1 && c.code <= 33);
  const homeCodes = costCodes.filter((c) => c.code >= 34 && c.code <= 102);
  const gaCodes = costCodes.filter((c) => c.code >= 103 && c.code <= 120);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <Link href="/invoices" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Accounts Payable
        </Link>

        {/* Steps */}
        <div className="flex items-center gap-2 mb-6">
          {(["upload", "extracting", "review"] as Step[]).map((s, i) => {
            const done = (step === "review" && s !== "review") || (step === "extracting" && s === "upload");
            const active = step === s;
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-8 ${done ? "bg-amber-400" : "bg-gray-200"}`} />}
                <div className={`flex items-center gap-1.5 text-xs font-medium ${active ? "text-amber-600" : done ? "text-green-600" : "text-gray-400"}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${active ? "bg-amber-500 text-gray-900" : done ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                    {done ? <CheckCircle2 size={12} /> : i + 1}
                  </div>
                  {["Upload", "Extract", "Review"][i]}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">

          {/* STEP 1 */}
          {step === "upload" && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-gray-900">Upload Invoice PDF</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project <span className="text-red-500">*</span></label>
                <select value={form.project_id} onChange={(e) => setField("project_id", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">Select project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragging ? "border-amber-400 bg-amber-50" : file ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-gray-400"
                }`}
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
                <div className="flex items-center gap-2 bg-amber-50 text-amber-700 text-sm px-4 py-2.5 rounded-lg">
                  <Sparkles size={15} />
                  AI will extract details and assign a cost code automatically.
                </div>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <button onClick={handleUpload} disabled={!file || !form.project_id || uploading}
                className="w-full bg-amber-500 text-gray-900 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {uploading ? <><Loader2 size={16} className="animate-spin" /> Uploading…</> : "Upload & Continue"}
              </button>
            </div>
          )}

          {/* STEP 2 */}
          {step === "extracting" && (
            <div className="py-12 text-center">
              <Loader2 size={40} className="text-amber-500 animate-spin mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Reading invoice…</h2>
              <p className="text-gray-500 text-sm">AI is extracting details and assigning a cost code.</p>
            </div>
          )}

          {/* STEP 3 */}
          {step === "review" && (
            <form onSubmit={handleSave} className="space-y-5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Review & Save</h2>
                {form.ai_confidence && (
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                    form.ai_confidence === "high" ? "text-green-700 bg-green-50" :
                    form.ai_confidence === "medium" ? "text-amber-700 bg-amber-50" :
                    "text-red-700 bg-red-50"
                  }`}>
                    <Sparkles size={11} /> AI {form.ai_confidence} confidence
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                  <input type="text" value={form.vendor} onChange={(e) => setField("vendor", e.target.value)}
                    placeholder="e.g. ABC Concrete"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                  <input type="text" value={form.invoice_number} onChange={(e) => setField("invoice_number", e.target.value)}
                    placeholder="e.g. INV-0042"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                  <input type="date" value={form.invoice_date} onChange={(e) => setField("invoice_date", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setField("amount", e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input type="date" value={form.due_date} onChange={(e) => setField("due_date", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${form.ai_confidence === "low" ? "text-red-600" : "text-gray-700"}`}>
                    Cost Code {form.ai_confidence === "low" && "(⚠ review required)"}
                  </label>
                  <select value={form.cost_code} onChange={(e) => setField("cost_code", e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                      form.ai_confidence === "low" ? "border-red-400" : "border-gray-300"
                    }`}>
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
                  className="flex-1 bg-amber-500 text-gray-900 py-2 px-4 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                  {saving ? "Saving…" : "Save Invoice"}
                </button>
                <Link href="/invoices"
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
