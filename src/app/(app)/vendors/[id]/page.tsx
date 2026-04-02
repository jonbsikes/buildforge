"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, AlertTriangle, Pencil, Check, X, Upload, ExternalLink, FileText } from "lucide-react";
import type { Database, VendorType } from "@/types/database";

type Vendor = Database["public"]["Tables"]["vendors"]["Row"];
type Invoice = Pick<Database["public"]["Tables"]["invoices"]["Row"], "id" | "invoice_number" | "invoice_date" | "amount" | "total_amount" | "status" | "vendor">;

interface VendorDocument {
  id: string;
  vendor_id: string;
  document_type: string | null;
  file_url: string;
  expiry_date: string | null;
  uploaded_at: string | null;
}

function daysUntil(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createClient();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendorDocs, setVendorDocs] = useState<VendorDocument[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Vendor>>({});
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docType, setDocType] = useState("other");
  const [docExpiry, setDocExpiry] = useState("");
  const docInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function load() {
      const [vRes, invRes, docsRes] = await Promise.all([
        supabase.from("vendors").select("*").eq("id", id).single(),
        supabase.from("invoices").select("id, invoice_number, invoice_date, amount, total_amount, status, vendor")
          .eq("vendor_id", id).order("invoice_date", { ascending: false }),
        supabase.from("vendor_documents").select("*").eq("vendor_id", id).order("uploaded_at", { ascending: false }),
      ]);
      if (vRes.data) { setVendor(vRes.data as Vendor); setForm(vRes.data as Vendor); }
      setInvoices((invRes.data ?? []) as Invoice[]);
      setVendorDocs((docsRes.data ?? []) as VendorDocument[]);
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    await supabase.from("vendors").update(form).eq("id", id);
    setVendor((prev) => prev ? { ...prev, ...form } : prev);
    setEditing(false);
    setSaving(false);
  }

  async function handleDocUpload(file: File) {
    setUploadingDoc(true);
    const ext = file.name.split(".").pop();
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("vendor-docs").upload(path, file);
    if (upErr) { setUploadingDoc(false); return; }
    const { data: urlData } = supabase.storage.from("vendor-docs").getPublicUrl(path);
    const { data, error } = await supabase.from("vendor_documents").insert({
      vendor_id: id,
      document_type: docType,
      file_url: urlData.publicUrl,
      expiry_date: docExpiry || null,
    }).select("*").single();
    if (!error && data) {
      setVendorDocs((prev) => [data as VendorDocument, ...prev]);
      setDocExpiry("");
      if (docInputRef.current) docInputRef.current.value = "";
    }
    setUploadingDoc(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this vendor? This cannot be undone.")) return;
    await supabase.from("vendors").delete().eq("id", id);
    router.push("/vendors");
  }

  if (!vendor) return <main className="flex-1 p-6"><div className="text-gray-400 text-sm">Loading…</div></main>;

  const coiDays = daysUntil(vendor.coi_expiry);
  const licDays = daysUntil(vendor.license_expiry);
  const totalSpend = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0);

  function field(key: keyof Vendor, label: string, type: string = "text") {
    const val = form[key] as string ?? "";
    return (
      <div key={key}>
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
        {editing ? (
          <input type={type} value={val} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value || null }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        ) : (
          <p className="text-sm text-gray-900">{(vendor![key] as string | null | undefined) || <span className="text-gray-400">—</span>}</p>
        )}
      </div>
    );
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <Link href="/vendors" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
          <ArrowLeft size={15} /> Vendors
        </Link>

        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{vendor.name}</h1>
            <p className="text-sm text-gray-500 capitalize">{vendor.type} · {totalSpend > 0 ? `${fmt(totalSpend)} paid` : "No paid invoices"}</p>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <button onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600">
                <Pencil size={14} /> Edit
              </button>
            ) : (
              <>
                <button onClick={handleSave} disabled={saving}
                  className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400 disabled:opacity-50">
                  <Check size={14} /> {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setEditing(false); setForm(vendor); }}
                  className="inline-flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600">
                  <X size={14} /> Cancel
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          {/* Contact */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Contact</h2>
            {field("contact_name", "Contact Name")}
            {field("phone", "Phone", "tel")}
            {field("email", "Email", "email")}
            {field("address", "Address")}
          </div>

          {/* Compliance */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Compliance</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">W-9 on File</label>
              {editing ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.w9_on_file}
                    onChange={(e) => setForm((f) => ({ ...f, w9_on_file: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span className="text-sm text-gray-700">Yes</span>
                </label>
              ) : (
                <p className="text-sm text-gray-900 flex items-center gap-1">
                  {vendor.w9_on_file ? <CheckCircle2 size={15} className="text-green-500" /> : <span className="text-gray-400">—</span>}
                  {vendor.w9_on_file ? "On file" : "Not on file"}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">COI Expiry</label>
              {editing ? (
                <input type="date" value={form.coi_expiry ?? ""} onChange={(e) => setForm((f) => ({ ...f, coi_expiry: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              ) : (
                <p className={`text-sm ${coiDays != null && coiDays <= 0 ? "text-red-600 font-medium" : coiDays != null && coiDays <= 30 ? "text-amber-600 font-medium" : "text-gray-900"}`}>
                  {coiDays != null && coiDays <= 30 && <AlertTriangle size={12} className="inline mr-1" />}
                  {fmtDate(vendor.coi_expiry)}
                  {coiDays != null && coiDays <= 30 && coiDays > 0 && <span className="text-xs ml-1">({coiDays}d)</span>}
                  {coiDays != null && coiDays <= 0 && <span className="text-xs ml-1">(EXPIRED)</span>}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">License Number</label>
              {field("license_number", "")}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">License Expiry</label>
              {editing ? (
                <input type="date" value={form.license_expiry ?? ""} onChange={(e) => setForm((f) => ({ ...f, license_expiry: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              ) : (
                <p className={`text-sm ${licDays != null && licDays <= 0 ? "text-red-600 font-medium" : licDays != null && licDays <= 30 ? "text-amber-600 font-medium" : "text-gray-900"}`}>
                  {licDays != null && licDays <= 30 && <AlertTriangle size={12} className="inline mr-1" />}
                  {fmtDate(vendor.license_expiry)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Invoice history */}
        <div className="bg-white rounded-xl border border-gray-200 mb-5">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Invoice History</h2>
          </div>
          {invoices.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">No invoices from this vendor.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Invoice #</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Date</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Amount</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-5 py-2">
                      <Link href={`/invoices/${inv.id}`} className="text-amber-600 hover:underline">{inv.invoice_number ?? "—"}</Link>
                    </td>
                    <td className="px-5 py-2 text-gray-500 text-xs">{fmtDate(inv.invoice_date)}</td>
                    <td className="px-5 py-2 text-right font-medium text-gray-900">{fmt(inv.amount ?? inv.total_amount)}</td>
                    <td className="px-5 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        inv.status === "paid" ? "bg-green-100 text-green-700" :
                        inv.status === "approved" ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>{inv.status?.replace("_", " ") ?? "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Vendor Documents */}
        <div className="bg-white rounded-xl border border-gray-200 mb-5">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Documents</h2>
          </div>
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Document Type</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="coi">COI</option>
                  <option value="w9">W-9</option>
                  <option value="license">License</option>
                  <option value="contract">Contract</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Expiry Date (optional)</label>
                <input type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <label className={`inline-flex items-center gap-1.5 text-sm border border-amber-400 text-amber-600 px-3 py-2 rounded-lg hover:bg-amber-50 cursor-pointer transition-colors ${uploadingDoc ? "opacity-50 pointer-events-none" : ""}`}>
                <Upload size={14} />
                {uploadingDoc ? "Uploading…" : "Upload Document"}
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDocUpload(file);
                  }}
                />
              </label>
            </div>
          </div>
          {vendorDocs.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">No documents uploaded.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {vendorDocs.map((doc) => (
                <div key={doc.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-800 capitalize">{(doc.document_type ?? "document").replace("_", " ")}</span>
                      {doc.expiry_date && (
                        <span className="ml-2 text-xs text-gray-400">Expires {fmtDate(doc.expiry_date)}</span>
                      )}
                    </div>
                  </div>
                  <a href={doc.file_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline shrink-0">
                    Download <ExternalLink size={11} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700 hover:underline">
            Delete vendor
          </button>
        </div>
      </div>
    </main>
  );
}
