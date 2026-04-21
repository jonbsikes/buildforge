"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowLeft, Upload, FileText, Sparkles, Loader2,
  CheckCircle2, XCircle, AlertTriangle, X, ChevronDown, ChevronUp,
  Plus, Trash2,
} from "lucide-react";
import type { ExtractedInvoiceData } from "@/app/api/invoices/extract/route";
import { saveInvoice } from "@/app/actions/invoices";

interface CostCode { code: string; category: string; name: string; project_type: "home_construction" | "land_development" | "general_admin" | null; }
interface Vendor { id: string; name: string; }
interface Project {
  id: string;
  name: string;
  project_type: string;
  address?: string | null;
  subdivision?: string | null;
  block?: string | null;
  lot?: string | null;
}
interface Props { projects: Project[]; costCodes: CostCode[]; vendors: Vendor[]; hasAI: boolean; }

type SingleStep = "upload" | "extracting" | "review";

type BatchStatus = "queued" | "uploading" | "extracting" | "done" | "error";
interface BatchItem {
  file: File;
  status: BatchStatus;
  error?: string;
  invoiceCount?: number;
}

interface InvoiceReviewItem {
  project_id: string;
  cost_code: string;          // primary code shown in review; written to line_items on save
  vendor: string;             // AI-extracted vendor name (display only)
  vendor_id: string;          // selected vendor from dropdown
  invoice_number: string;
  invoice_date: string;
  amount: string;
  due_date: string;
  ai_notes: string;
  ai_confidence: "high" | "medium" | "low" | "";
  line_items: { cost_code: string; description: string; amount: number }[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isPDF(f: File) { return f.type.includes("pdf") || f.name.toLowerCase().endsWith(".pdf"); }
function fileSizeOk(f: File) { return f.size <= 20 * 1024 * 1024; }

const MULTI_PROJECT = "__multiple__";

function emptyReviewItem(): InvoiceReviewItem {
  return { project_id: "", cost_code: "", vendor: "", vendor_id: "", invoice_number: "", invoice_date: "", amount: "", due_date: "", ai_notes: "", ai_confidence: "", line_items: [] };
}

/** Strip suffixes like LLC, Inc, Corp and normalize whitespace / casing for fuzzy vendor matching */
function normalizeVendorName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,'"]/g, "")
    .replace(/\b(llc|inc|corp|corporation|incorporated|co|company|ltd|lp|llp|dba)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find the best matching vendor by name — exact normalized match or containment */
function matchVendor(extractedName: string, vendors: Vendor[]): string {
  if (!extractedName) return "";
  const normalized = normalizeVendorName(extractedName);
  // 1) Exact normalized match
  const exact = vendors.find((v) => normalizeVendorName(v.name) === normalized);
  if (exact) return exact.id;
  // 2) Containment match
  const contains = vendors.find((v) => {
    const vNorm = normalizeVendorName(v.name);
    return vNorm.includes(normalized) || normalized.includes(vNorm);
  });
  return contains?.id ?? "";
}

function extractedToReviewItem(inv: ExtractedInvoiceData, vendors: Vendor[]): InvoiceReviewItem {
  const vendorName = inv.vendor ?? "";
  const vendorId = matchVendor(vendorName, vendors);
  return {
    project_id: inv.project_id ?? "",
    cost_code: inv.line_items?.[0]?.cost_code ?? "",
    vendor: vendorName,
    vendor_id: vendorId,
    invoice_number: inv.invoice_number ?? "",
    invoice_date: inv.invoice_date ?? "",
    amount: inv.total_amount != null ? String(inv.total_amount) : "",
    due_date: inv.due_date ?? "",
    ai_notes: inv.ai_notes ?? "",
    ai_confidence: inv.ai_confidence ?? "",
    line_items: (inv.line_items ?? []).map((li) => ({
      cost_code: li.cost_code ?? "",
      description: li.description ?? "",
      amount: li.amount ?? 0,
    })),
  };
}

async function uploadAndExtract(
  supabase: ReturnType<typeof createClient>,
  file: File,
  projectId: string,
  hasAI: boolean,
  userId: string,
  allProjects?: Project[],
): Promise<{ invoiceCount: number }> {
  const filePath = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage
    .from("invoices")
    .upload(filePath, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const isMulti = projectId === MULTI_PROJECT;

  if (!hasAI) {
    const { error } = await supabase.from("invoices").insert({
      project_id: isMulti ? null : (projectId || null),
      user_id: userId,
      file_path: filePath,
      file_name: file.name,
      processed: false,
      status: "pending_review",
      source: "upload",
    });
    if (error) throw new Error(`DB error: ${error.message}`);
    return { invoiceCount: 1 };
  }

  const fd = new FormData();
  fd.append("file", file);
  if (allProjects?.length) {
    fd.append("projects", JSON.stringify(allProjects.map((p) => ({
      id: p.id, name: p.name, type: p.project_type,
      address: p.address ?? null, subdivision: p.subdivision ?? null,
      block: p.block ?? null, lot: p.lot ?? null,
    }))));
  }
  const res = await fetch("/api/invoices/extract", { method: "POST", body: fd });
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  const invoices: ExtractedInvoiceData[] = data.invoices ?? [];
  if (!invoices.length) throw new Error("No invoice data extracted");

  let created = 0;
  for (const inv of invoices) {
    const resolvedProjectId = isMulti ? (inv.project_id || null) : (projectId || null);
    const { data: record, error: insertError } = await supabase.from("invoices").insert({
      project_id: resolvedProjectId,
      user_id: userId,
      file_path: filePath,
      file_name: file.name,
      vendor: inv.vendor || null,
      invoice_number: inv.invoice_number || null,
      invoice_date: inv.invoice_date || null,
      due_date: (() => {
        let dd = inv.due_date || null;
        if (inv.invoice_date && dd) {
          const minDue = new Date(inv.invoice_date + "T00:00:00");
          minDue.setDate(minDue.getDate() + 7);
          const minDueStr = minDue.toISOString().split("T")[0];
          if (dd < minDueStr) dd = minDueStr;
        } else if (inv.invoice_date && !dd) {
          const minDue = new Date(inv.invoice_date + "T00:00:00");
          minDue.setDate(minDue.getDate() + 7);
          dd = minDue.toISOString().split("T")[0];
        }
        return dd;
      })(),
      amount: inv.total_amount || null,
      total_amount: inv.total_amount || null,
      ai_notes: inv.ai_notes || null,
      ai_confidence: inv.ai_confidence || null,
      processed: true,
      status: "pending_review",
      source: "upload",
    }).select("id").single();

    if (!insertError && record) {
      created++;
      const lineItems = inv.line_items?.length
        ? inv.line_items
        : inv.line_items?.[0]?.cost_code
          ? [{ cost_code: inv.line_items[0].cost_code, description: inv.vendor || "Invoice", amount: inv.total_amount ?? 0 }]
          : [];
      if (lineItems.length) {
        await supabase.from("invoice_line_items").insert(
          lineItems.map((li) => ({
            invoice_id: record.id,
            cost_code: li.cost_code || null,
            description: li.description || "",
            amount: li.amount || 0,
            project_id: resolvedProjectId,
          }))
        );
      }
    }
  }

  return { invoiceCount: created };
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (!confidence) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
      confidence === "high" ? "text-green-700 bg-green-50" :
      confidence === "medium" ? "text-amber-700 bg-amber-50" :
      "text-red-700 bg-red-50"}`}>
      <Sparkles size={11} /> AI {confidence} confidence
    </span>
  );
}

// ─── Single invoice review card ───────────────────────────────────────────────

function InvoiceCard({
  item, idx, total, projects, costCodes, vendors, expanded, onToggle, onChange, onCreateVendor,
}: {
  item: InvoiceReviewItem;
  idx: number;
  total: number;
  projects: Project[];
  costCodes: CostCode[];
  vendors: Vendor[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (field: keyof InvoiceReviewItem, value: string) => void;
  onCreateVendor: (idx: number) => void;
}) {
  const landCodes = costCodes.filter((c) => c.project_type === "land_development");
  const homeCodes = costCodes.filter((c) => c.project_type === "home_construction");
  const gaCodes   = costCodes.filter((c) => c.project_type === "general_admin");

  return (
    <div className={`border rounded-xl overflow-hidden ${item.ai_confidence === "low" ? "border-red-300" : "border-gray-200"}`}>
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left">
        {total > 1 && (
          <span className="text-xs font-semibold text-gray-500 uppercase shrink-0">Invoice {idx + 1} of {total}</span>
        )}
        <ConfidenceBadge confidence={item.ai_confidence} />
        {(item.vendor_id ? vendors.find((v) => v.id === item.vendor_id)?.name : item.vendor) && (
          <span className="text-sm font-medium text-gray-800 truncate">
            {item.vendor_id ? vendors.find((v) => v.id === item.vendor_id)?.name : item.vendor}
          </span>
        )}
        {item.invoice_number && <span className="text-xs text-gray-400">#{item.invoice_number}</span>}
        {item.amount && (
          <span className="ml-auto text-sm font-semibold text-gray-800 shrink-0">
            ${parseFloat(item.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        )}
        <span className="text-gray-400 shrink-0 ml-2">{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </button>

      {expanded && (
        <div className="p-4 space-y-4 border-t border-gray-100">
          {item.ai_confidence === "low" && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">
              <AlertTriangle size={14} /> Low confidence — review all fields carefully before saving.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
            <select value={item.project_id} onChange={(e) => onChange("project_id", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
              <option value="">— G&A (no project) —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <select value={item.vendor_id} onChange={(e) => onChange("vendor_id", e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] ${!item.vendor_id && item.vendor ? "border-amber-400" : "border-gray-300"}`}>
                <option value="">— Select vendor —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {!item.vendor_id && item.vendor && (
                <p className="mt-1 text-xs text-amber-600">
                  No match for &ldquo;{item.vendor}&rdquo; —{" "}
                  <button type="button" onClick={() => onCreateVendor(idx)} className="text-[#4272EF] hover:underline font-medium">
                    + Create new vendor
                  </button>
                </p>
              )}
              {(item.vendor_id || !item.vendor) && (
                <button type="button" onClick={() => onCreateVendor(idx)} className="mt-1 text-xs text-[#4272EF] hover:underline">
                  + Create new vendor
                </button>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
              <input type="text" value={item.invoice_number} onChange={(e) => onChange("invoice_number", e.target.value)}
                placeholder="e.g. INV-0042"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
              <input type="date" value={item.invoice_date} onChange={(e) => onChange("invoice_date", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <input type="number" min="0" step="0.01" value={item.amount} onChange={(e) => onChange("amount", e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={item.due_date} onChange={(e) => onChange("due_date", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]" />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${item.ai_confidence === "low" ? "text-red-600" : "text-gray-700"}`}>
                Cost Code {item.ai_confidence === "low" && "(⚠ review required)"}
              </label>
              <select value={item.cost_code} onChange={(e) => onChange("cost_code", e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] ${item.ai_confidence === "low" ? "border-red-400" : "border-gray-300"}`}>
                <option value="">— Select cost code —</option>
                <optgroup label="Land Development">
                  {landCodes.map((c) => <option key={c.code} value={String(c.code)}>{c.code} — {c.name}</option>)}
                </optgroup>
                <optgroup label="Home Construction">
                  {homeCodes.map((c) => <option key={c.code} value={String(c.code)}>{c.code} — {c.name}</option>)}
                </optgroup>
                <optgroup label="General & Administrative">
                  {gaCodes.map((c) => <option key={c.code} value={String(c.code)}>{c.code} — {c.name}</option>)}
                </optgroup>
              </select>
            </div>
          </div>

          {item.line_items.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Line Items ({item.line_items.length})</label>
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
                    {item.line_items.map((li, i) => (
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

          {item.ai_notes && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-600">
              <span className="font-medium text-gray-700">AI note: </span>{item.ai_notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PDF viewer ───────────────────────────────────────────────────────────────

function PdfPane({ objectUrl, fileName }: { objectUrl: string; fileName: string }) {
  return (
    <div className="flex-1 min-w-0 sticky top-6">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col" style={{ height: "calc(100vh - 120px)" }}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50 shrink-0">
          <FileText size={14} className="text-gray-400" />
          <span className="text-sm text-gray-700 truncate">{fileName}</span>
        </div>
        <iframe src={objectUrl} className="flex-1 w-full" title="Invoice PDF" />
      </div>
    </div>
  );
}

// ─── Single-file upload flow ──────────────────────────────────────────────────

function SingleUpload({ projects, costCodes, vendors: initialVendors, hasAI }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [step, setStep] = useState<SingleStep>("upload");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string>("");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceReviewItem[]>([]);
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set([0]));
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);

  // Handle return from vendor creation page
  useEffect(() => {
    const returnedVendorId = searchParams.get("vendorId");
    const returnedVendorName = searchParams.get("vendorName");
    const vendorCardIdx = searchParams.get("vendorCardIdx");
    if (returnedVendorId && vendorCardIdx != null) {
      // Add the new vendor to the local list
      if (returnedVendorName) {
        setVendors((prev) => {
          if (prev.some((v) => v.id === returnedVendorId)) return prev;
          return [...prev, { id: returnedVendorId, name: returnedVendorName }].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
      // Set vendor_id on the relevant invoice card
      const idx = parseInt(vendorCardIdx, 10);
      setInvoiceItems((items) => items.map((item, i) => i === idx ? { ...item, vendor_id: returnedVendorId } : item));
    }
  }, [searchParams]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
  }, []);

  const handleFile = useCallback((f: File) => {
    if (!isPDF(f)) { setError("Only PDF files are supported."); return; }
    if (!fileSizeOk(f)) { setError("File must be under 20MB."); return; }
    setError(null);
    setFile(f);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(f);
    objectUrlRef.current = url;
    setObjectUrl(url);
  }, []);

  function toggleExpanded(idx: number) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function setItemField(idx: number, field: keyof InvoiceReviewItem, value: string) {
    setInvoiceItems((items) => items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // Upload file to storage
    const fp = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(fp, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) { setError(`Upload failed: ${uploadError.message}`); setUploading(false); return; }
    setFilePath(fp);
    setUploading(false);

    let items: InvoiceReviewItem[] = [];
    let extractionFailed = false;

    if (hasAI) {
      setStep("extracting");
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("projects", JSON.stringify(
          projects.map((p) => ({
            id: p.id, name: p.name, type: p.project_type,
            address: p.address ?? null, subdivision: p.subdivision ?? null,
            block: p.block ?? null, lot: p.lot ?? null,
          }))
        ));
        const res = await fetch("/api/invoices/extract", { method: "POST", body: fd });
        const data = await res.json();
        if (!data.error && data.invoices?.length) {
          items = (data.invoices as ExtractedInvoiceData[]).map((inv) => extractedToReviewItem(inv, vendors));
        } else {
          extractionFailed = true;
        }
      } catch {
        extractionFailed = true;
      }
    }

    if (!items.length) {
      items = [emptyReviewItem()];
      if (extractionFailed) {
        items[0].ai_notes = "AI extraction failed — please fill in the details from the PDF on the right.";
        items[0].ai_confidence = "low";
      }
    }

    setInvoiceItems(items);
    setExpandedSet(new Set(items.slice(0, 5).map((_, i) => i)));
    setStep("review");
  }

  function handleCreateVendor(cardIdx: number) {
    // Save draft state so we can restore it when returning
    sessionStorage.setItem("invoice_upload_draft", JSON.stringify({
      step, filePath, invoiceItems, expandedSet: Array.from(expandedSet),
    }));
    const item = invoiceItems[cardIdx];
    const params = new URLSearchParams();
    if (item.vendor) params.set("name", item.vendor);
    params.set("returnTo", "invoice-upload");
    params.set("vendorCardIdx", String(cardIdx));
    router.push(`/vendors/new?${params.toString()}`);
  }

  // Restore draft state when returning from vendor creation
  useEffect(() => {
    const draft = sessionStorage.getItem("invoice_upload_draft");
    if (draft && searchParams.get("vendorId")) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.step) setStep(parsed.step);
        if (parsed.filePath) setFilePath(parsed.filePath);
        if (parsed.invoiceItems?.length) setInvoiceItems(parsed.invoiceItems);
        if (parsed.expandedSet?.length) setExpandedSet(new Set(parsed.expandedSet));
      } catch { /* ignore parse errors */ }
      sessionStorage.removeItem("invoice_upload_draft");
    }
  }, [searchParams]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!filePath || !file) return;

    // Validate all invoices have a vendor selected
    for (let i = 0; i < invoiceItems.length; i++) {
      if (!invoiceItems[i].vendor_id) {
        setError(`Invoice ${invoiceItems.length > 1 ? `${i + 1}: ` : ""}A vendor must be selected. Use "+ Create new vendor" if the vendor isn't listed.`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const errors: string[] = [];

    for (let i = 0; i < invoiceItems.length; i++) {
      const item = invoiceItems[i];
      const vendorName = vendors.find((v) => v.id === item.vendor_id)?.name ?? item.vendor;

      const { data: invoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          project_id: item.project_id || null,
          user_id: user.id,
          file_path: filePath,
          file_name: file.name,
          vendor_id: item.vendor_id || null,
          vendor: vendorName || null,
          invoice_number: item.invoice_number || null,
          invoice_date: item.invoice_date || null,
          due_date: item.due_date || null,
          amount: parseFloat(item.amount) || null,
          total_amount: parseFloat(item.amount) || null,
          ai_notes: item.ai_notes || null,
          ai_confidence: (item.ai_confidence as "high" | "medium" | "low") || null,
          processed: true,
          status: "pending_review",
          source: "upload",
        })
        .select("id")
        .single();

      if (insertError || !invoice) {
        errors.push(`Invoice ${i + 1}: ${insertError?.message ?? "Unknown error"}`);
        continue;
      }

      // Build line items from line_items array, or fall back to primary cost_code
      const lineItemsToSave: { cost_code: string | null; description: string; amount: number }[] = [];

      if (item.line_items.length > 0) {
        // Use extracted line items, ensuring cost_code is set (fall back to primary if missing)
        item.line_items.forEach((li) => {
          lineItemsToSave.push({
            cost_code: li.cost_code || item.cost_code || null,
            description: li.description || "",
            amount: li.amount || 0,
          });
        });
      } else if (item.cost_code || item.amount) {
        // Single-line invoice
        lineItemsToSave.push({
          cost_code: item.cost_code || null,
          description: vendors.find((v) => v.id === item.vendor_id)?.name || item.vendor || "Invoice",
          amount: parseFloat(item.amount) || 0,
        });
      }

      if (lineItemsToSave.length > 0) {
        await supabase.from("invoice_line_items").insert(
          lineItemsToSave.map((li) => ({
            invoice_id: invoice.id,
            cost_code: li.cost_code,
            description: li.description,
            amount: li.amount,
            project_id: item.project_id || null,
          }))
        );
      }
    }

    if (errors.length > 0) {
      setError(`Save failed: ${errors.join("; ")}`);
      setSaving(false);
      return;
    }

    router.push("/invoices");
  }

  const showPdf = objectUrl && file;

  return (
    <div className={showPdf ? "flex gap-6 items-start" : ""}>
      {/* Form panel */}
      <div className={showPdf ? "w-[480px] shrink-0" : "w-full"}>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {/* Step indicators */}
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
                    <p className="text-sm text-gray-400">Single or multi-page PDF up to 20MB</p>
                  </div>
                )}
              </div>
              {hasAI && (
                <div className="flex items-center gap-2 bg-blue-50 text-[#4272EF] text-sm px-4 py-2.5 rounded-lg">
                  <Sparkles size={15} />
                  AI will extract details and assign cost codes. Multi-invoice PDFs are supported.
                </div>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              <button onClick={handleUpload} disabled={!file || uploading}
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
              <p className="text-gray-500 text-sm">AI is extracting details. Multi-invoice PDFs will show each separately.</p>
            </div>
          )}

          {step === "review" && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Review & Save
                  {invoiceItems.length > 1 && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      — {invoiceItems.length} invoices found
                    </span>
                  )}
                </h2>
              </div>

              {invoiceItems.map((item, idx) => (
                <InvoiceCard
                  key={idx}
                  item={item}
                  idx={idx}
                  total={invoiceItems.length}
                  projects={projects}
                  costCodes={costCodes}
                  vendors={vendors}
                  expanded={expandedSet.has(idx)}
                  onToggle={() => toggleExpanded(idx)}
                  onChange={(field, value) => setItemField(idx, field, value)}
                  onCreateVendor={handleCreateVendor}
                />
              ))}

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 px-4 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: "#4272EF" }}>
                  {saving
                    ? "Saving…"
                    : invoiceItems.length > 1
                      ? `Save All ${invoiceItems.length} Invoices`
                      : "Save Invoice"}
                </button>
                <Link href="/invoices" className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* PDF viewer panel */}
      {showPdf && <PdfPane objectUrl={objectUrl} fileName={file.name} />}
    </div>
  );
}

// ─── Batch upload flow ────────────────────────────────────────────────────────

const STATUS_ICON: Record<BatchStatus, React.ReactNode> = {
  queued:     <div className="w-4 h-4 rounded-full border-2 border-gray-300" />,
  uploading:  <Loader2 size={16} className="animate-spin text-[#4272EF]" />,
  extracting: <Loader2 size={16} className="animate-spin text-amber-500" />,
  done:       <CheckCircle2 size={16} className="text-green-500" />,
  error:      <XCircle size={16} className="text-red-500" />,
};

const STATUS_LABEL: Record<BatchStatus, string> = {
  queued: "Queued", uploading: "Uploading…", extracting: "Extracting…", done: "Done", error: "Error",
};

function BatchUpload({ projects, vendors, hasAI }: Props) {
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
    if (errs.length) setError(errs.join("; ")); else setError(null);
    if (valid.length) setItems((prev) => [...prev, ...valid.map((f) => ({ file: f, status: "queued" as BatchStatus }))]);
  }

  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)); }
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
      updateItem(i, { status: hasAI ? "extracting" : "uploading" });
      try {
        const { invoiceCount } = await uploadAndExtract(supabase, item.file, projectId, hasAI, user.id, projects);
        updateItem(i, { status: "done", invoiceCount });
      } catch (err) {
        updateItem(i, { status: "error", error: (err as Error).message });
      }
    }
    setRunning(false);
    setDone(true);
  }

  const allDone = items.length > 0 && items.every((it) => it.status === "done" || it.status === "error");
  const doneCount = items.filter((it) => it.status === "done").length;
  const totalInvoices = items.filter((it) => it.status === "done").reduce((sum, it) => sum + (it.invoiceCount ?? 1), 0);
  const errorCount = items.filter((it) => it.status === "error").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Multiple Files</h2>

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
                    <button type="button" onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-400 transition-colors">
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
                ? "AI will assign each invoice to the correct project. Multi-invoice PDFs produce separate records."
                : "AI will extract details from each file automatically."}
            </div>
          )}

          <button onClick={handleRun} disabled={items.length === 0}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: "#4272EF" }}>
            Upload {items.length > 0 ? `${items.length} File${items.length !== 1 ? "s" : ""}` : "Files"}
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
                <span className={`text-xs font-medium ${item.status === "done" ? "text-green-600" : item.status === "error" ? "text-red-500" : item.status === "queued" ? "text-gray-400" : "text-[#4272EF]"}`}>
                  {item.status === "done" && item.invoiceCount && item.invoiceCount > 1
                    ? `Done (${item.invoiceCount} invoices)`
                    : STATUS_LABEL[item.status]}
                </span>
                {item.status === "error" && item.error && (
                  <span className="text-xs text-red-400 max-w-[160px] truncate" title={item.error}>{item.error}</span>
                )}
              </div>
            ))}
          </div>

          {allDone && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${errorCount > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>
              {errorCount > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              {doneCount} file{doneCount !== 1 ? "s" : ""} processed
              {totalInvoices !== doneCount ? ` → ${totalInvoices} invoices created` : " successfully"}
              {errorCount > 0 ? `, ${errorCount} failed` : ""}.
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
              Processing {items.find((it) => it.status === "uploading" || it.status === "extracting")?.file.name ?? ""}…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual entry flow (no PDF) ───────────────────────────────────────────────

interface ManualLineItem {
  project_id: string;
  cost_code: string;
  description: string;
  amount: string;
}

const EMPTY_MANUAL_LINE: ManualLineItem = { project_id: "", cost_code: "", description: "", amount: "" };

function manualFieldClass(err = false) {
  return `w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] focus:border-transparent ${err ? "border-red-400" : "border-gray-300"}`;
}

function ManualField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function codesForProject(projectId: string, projects: Project[], costCodes: CostCode[]): CostCode[] {
  const proj = projects.find((p) => p.id === projectId);
  if (!proj) return costCodes.filter((c) => c.project_type === "general_admin");
  if (proj.project_type === "home_construction") return costCodes.filter((c) => c.project_type === "home_construction");
  if (proj.project_type === "land_development") return costCodes.filter((c) => c.project_type === "land_development");
  return costCodes;
}

function ManualEntry({ projects, costCodes, vendors: initialVendors }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [vendorId, setVendorId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<"pending_review" | "approved" | "released" | "cleared" | "disputed" | "void">("pending_review");
  const [paymentMethod, setPaymentMethod] = useState<"" | "check" | "ach" | "wire" | "credit_card">("");
  const [pendingDraw, setPendingDraw] = useState(false);
  const [directCashPayment, setDirectCashPayment] = useState(false);
  const [lineItems, setLineItems] = useState<ManualLineItem[]>([{ ...EMPTY_MANUAL_LINE }]);

  // Detect Loan Interest cost codes (121/122) — drives the auto-draft callout
  const hasLoanInterestCode = lineItems.some((li) => li.cost_code === "121" || li.cost_code === "122");

  // Auto-clear directCashPayment when Loan Interest code is removed
  useEffect(() => {
    if (!hasLoanInterestCode && directCashPayment) {
      setDirectCashPayment(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLoanInterestCode]);

  // Auto-set payment method to ACH when auto-draft is enabled
  useEffect(() => {
    if (directCashPayment && paymentMethod !== "ach") {
      setPaymentMethod("ach");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directCashPayment]);

  const showPaymentMethod = status === "released" || status === "cleared" || directCashPayment;
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const manualFileInputRef = useRef<HTMLInputElement>(null);

  // Handle return from vendor creation page
  useEffect(() => {
    const returnedVendorId = searchParams.get("vendorId");
    const returnedVendorName = searchParams.get("vendorName");
    const fromManual = searchParams.get("mode") === "manual";
    if (returnedVendorId && fromManual) {
      if (returnedVendorName) {
        setVendors((prev) => {
          if (prev.some((v) => v.id === returnedVendorId)) return prev;
          return [...prev, { id: returnedVendorId, name: returnedVendorName }].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
      setVendorId(returnedVendorId);
    }
  }, [searchParams]);

  // Restore draft state when returning from vendor creation
  useEffect(() => {
    const draft = sessionStorage.getItem("invoice_manual_draft");
    if (draft && searchParams.get("vendorId") && searchParams.get("mode") === "manual") {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.invoiceNumber) setInvoiceNumber(parsed.invoiceNumber);
        if (parsed.invoiceDate) setInvoiceDate(parsed.invoiceDate);
        if (parsed.dueDate) setDueDate(parsed.dueDate);
        if (parsed.status) setStatus(parsed.status);
        if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
        if (typeof parsed.pendingDraw === "boolean") setPendingDraw(parsed.pendingDraw);
        if (typeof parsed.directCashPayment === "boolean") setDirectCashPayment(parsed.directCashPayment);
        if (parsed.lineItems?.length) setLineItems(parsed.lineItems);
      } catch { /* ignore */ }
      sessionStorage.removeItem("invoice_manual_draft");
    }
  }, [searchParams]);

  function updateLine(idx: number, key: keyof ManualLineItem, value: string) {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [key]: value } : li)));
  }

  function updateLineProject(idx: number, newProjectId: string) {
    setLineItems((prev) =>
      prev.map((li, i) => {
        if (i !== idx) return li;
        const codes = codesForProject(newProjectId, projects, costCodes);
        const codeStillValid = codes.some((c) => c.code === li.cost_code);
        return { ...li, project_id: newProjectId, cost_code: codeStillValid ? li.cost_code : "" };
      })
    );
  }

  const lineTotal = lineItems.reduce((sum, li) => {
    const n = parseFloat(li.amount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  function handleCreateVendor() {
    sessionStorage.setItem("invoice_manual_draft", JSON.stringify({
      invoiceNumber, invoiceDate, dueDate, status, paymentMethod, pendingDraw, directCashPayment, lineItems,
    }));
    const params = new URLSearchParams();
    params.set("returnTo", "invoice-upload");
    params.set("mode", "manual");
    router.push(`/vendors/new?${params.toString()}`);
  }

  function validate(): string | null {
    if (!vendorId) return "A vendor must be selected. Use '+ Create new vendor' if the vendor isn't listed.";
    if (!invoiceDate) return "Invoice date is required";
    if (lineItems.some((li) => !li.cost_code || !li.amount)) return "Each line item needs a cost code and amount";
    if (lineItems.some((li) => isNaN(parseFloat(li.amount)) || parseFloat(li.amount) <= 0)) return "All amounts must be positive numbers";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setSubmitError(err); return; }
    setSubmitError(null);
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const vendorName = vendors.find((v) => v.id === vendorId)?.name ?? "";

    // Dominant project = project on the largest line item (for display name)
    const dominantLine = lineItems.reduce((max, li) => {
      const a = parseFloat(li.amount) || 0;
      const b = parseFloat(max.amount) || 0;
      return a > b ? li : max;
    }, lineItems[0]);
    const dominantProject = projects.find((p) => p.id === dominantLine?.project_id) ?? null;

    // Default due_date to entry date if not provided (per CLAUDE.md business rule)
    const today = new Date().toISOString().split("T")[0];
    const resolvedDueDate = dueDate || today;

    // Optional PDF upload
    let uploadedPath: string | null = null;
    let uploadedName: string | null = null;
    if (file) {
      const fp = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(fp, file, { contentType: file.type || "application/pdf", upsert: false });
      if (uploadError) {
        setSubmitError(`File upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      uploadedPath = fp;
      uploadedName = file.name;
    }

    // Route through saveInvoice so applyStatusTransition fires the correct JEs
    const result = await saveInvoice({
      vendor_id: vendorId,
      vendor_name: vendorName,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: resolvedDueDate,
      source: "manual",
      file_path: uploadedPath,
      file_name_original: uploadedName,
      ai_confidence: "high",
      ai_notes: "",
      line_items: lineItems.map((li) => ({
        cost_code: li.cost_code,
        description: li.description,
        amount: parseFloat(li.amount) || 0,
        project_id: li.project_id || null,
      })),
      project_name: dominantProject?.name ?? "Company",
      status,
      pending_draw: pendingDraw && !directCashPayment,
      direct_cash_payment: directCashPayment,
      payment_method: paymentMethod || null,
    });

    if (result.error) {
      setSubmitError(result.error);
      setSaving(false);
      return;
    }

    router.push("/invoices");
  }

  function handleFileSelect(f: File | null) {
    if (!f) { setFile(null); setFileError(null); return; }
    if (!isPDF(f)) { setFileError("Only PDF files are supported."); return; }
    if (!fileSizeOk(f)) { setFileError("File must be under 20MB."); return; }
    setFileError(null);
    setFile(f);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5">
      {/* Optional file attachment */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Attachment <span className="text-gray-400 font-normal">(optional)</span></h2>
          {file && (
            <button type="button" onClick={() => { setFile(null); if (manualFileInputRef.current) manualFileInputRef.current.value = ""; }}
              className="text-xs text-gray-400 hover:text-red-500">Remove</button>
          )}
        </div>
        <input ref={manualFileInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)} />
        {file ? (
          <div className="flex items-center gap-3 px-3 py-2.5 border border-green-200 bg-green-50 rounded-lg">
            <FileText size={16} className="text-green-600 shrink-0" />
            <span className="flex-1 text-sm text-gray-800 truncate">{file.name}</span>
            <span className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</span>
            <button type="button" onClick={() => manualFileInputRef.current?.click()}
              className="text-xs text-[#4272EF] hover:underline">Change</button>
          </div>
        ) : (
          <button type="button" onClick={() => manualFileInputRef.current?.click()}
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

        <ManualField label="Vendor" required>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={manualFieldClass(!vendorId && !!submitError)}>
            <option value="">— Select vendor —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <button type="button" onClick={handleCreateVendor}
            className="inline-block mt-1 text-xs text-[#4272EF] hover:underline">
            + Create new vendor
          </button>
        </ManualField>

        <div className="grid grid-cols-3 gap-4">
          <ManualField label="Invoice Number">
            <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" className={manualFieldClass()} />
          </ManualField>
          <ManualField label="Invoice Date" required>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={manualFieldClass(!invoiceDate && !!submitError)} />
          </ManualField>
          <ManualField label="Due Date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={manualFieldClass()} />
          </ManualField>
        </div>

        <div className={`grid ${showPaymentMethod ? "grid-cols-2" : "grid-cols-1"} gap-4`}>
          <ManualField label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={manualFieldClass()}>
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="released">Released</option>
              <option value="cleared">Cleared</option>
              <option value="disputed">Disputed</option>
              <option value="void">Void</option>
            </select>
            {status !== "pending_review" && status !== "disputed" && (
              <p className="mt-1 text-xs text-amber-700">
                Saving with this status will automatically post the corresponding journal entries to the ledger.
              </p>
            )}
          </ManualField>
          {showPaymentMethod && (
            <ManualField label="Payment Method" required={status === "released" || status === "cleared"}>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                disabled={directCashPayment}
                className={manualFieldClass()}
              >
                <option value="">— Select payment method —</option>
                <option value="check">Check</option>
                <option value="ach">ACH / Auto-Draft</option>
                <option value="wire">Wire</option>
                <option value="credit_card">Credit Card</option>
              </select>
              {directCashPayment && (
                <p className="mt-1 text-xs text-gray-500">
                  Auto-set to ACH because bank auto-draft is enabled.
                </p>
              )}
            </ManualField>
          )}
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
            const lineCodes = codesForProject(li.project_id, projects, costCodes);
            return (
              <div key={idx} className="grid grid-cols-[180px_180px_1fr_110px_32px] gap-2 items-center">
                <select value={li.project_id} onChange={(e) => updateLineProject(idx, e.target.value)} className={manualFieldClass()}>
                  <option value="">— G&A —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select value={li.cost_code} onChange={(e) => updateLine(idx, "cost_code", e.target.value)}
                  className={manualFieldClass(!li.cost_code && !!submitError)}>
                  <option value="">— Code —</option>
                  {lineCodes.map((cc) => (
                    <option key={cc.code} value={cc.code}>{cc.code} – {cc.name}</option>
                  ))}
                </select>
                <input type="text" value={li.description} onChange={(e) => updateLine(idx, "description", e.target.value)}
                  placeholder="Description" className={manualFieldClass()} />
                <input type="number" step="0.01" min="0" value={li.amount} onChange={(e) => updateLine(idx, "amount", e.target.value)}
                  placeholder="0.00" className={manualFieldClass(!li.amount && !!submitError)} />
                <button type="button" onClick={() => setLineItems((p) => p.filter((_, i) => i !== idx))}
                  disabled={lineItems.length === 1}
                  className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={() => setLineItems((p) => [...p, { ...EMPTY_MANUAL_LINE }])}
          className="mt-3 flex items-center gap-1.5 text-sm text-[#4272EF] hover:text-[#3461de]">
          <Plus size={15} />
          Add line item
        </button>
      </section>

      {/* Auto-draft callout — surfaces when cost code 121/122 is selected */}
      {hasLoanInterestCode && (
        <section className="bg-amber-50 rounded-xl border-2 border-amber-300 p-5">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={directCashPayment}
              onChange={(e) => {
                setDirectCashPayment(e.target.checked);
                if (e.target.checked) setPendingDraw(false);
              }}
              className="mt-0.5 w-4 h-4 rounded border-amber-400 accent-[#4272EF]"
            />
            <div className="flex-1">
              <span className="text-sm font-semibold text-amber-900">
                Loan Interest detected — is this bank auto-drafted from your operating account?
              </span>
              <p className="text-xs text-amber-800 mt-1">
                Check this box if your bank pulls the interest directly (most construction loans). On approval, posts
                DR WIP/CIP / CR Cash as a single entry — skips AP and draw. Payment date is set to today.
              </p>
            </div>
          </label>
        </section>
      )}

      {submitError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{submitError}</div>
      )}

      <div className="flex items-center justify-between pb-6">
        <Link href="/invoices" className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
          Cancel
        </Link>
        <button type="submit" disabled={saving}
          className="px-6 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] disabled:opacity-60 flex items-center gap-2">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save Invoice"}
        </button>
      </div>
    </form>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

type Mode = "single" | "batch" | "manual";

export default function InvoiceUploadForm(props: Props) {
  const searchParams = useSearchParams();
  const initialMode: Mode =
    searchParams.get("mode") === "batch" ? "batch"
    : searchParams.get("mode") === "manual" ? "manual"
    : "single";
  const [mode, setMode] = useState<Mode>(initialMode);

  const maxWidth =
    mode === "single" ? "none"
    : mode === "manual" ? "48rem"
    : "42rem";

  return (
    <main className="flex-1 p-4 lg:p-6 overflow-auto">
      <div className="mx-auto" style={{ maxWidth }}>
        <Link href="/invoices" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Accounts Payable
        </Link>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          <button onClick={() => setMode("manual")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "manual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            Manual Entry
          </button>
          <button onClick={() => setMode("single")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "single" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            Upload PDF
          </button>
          <button onClick={() => setMode("batch")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "batch" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            Multiple Files
          </button>
        </div>

        {mode === "single" && <SingleUpload {...props} />}
        {mode === "batch" && <BatchUpload {...props} />}
        {mode === "manual" && <ManualEntry {...props} />}
      </div>
    </main>
  );
}
