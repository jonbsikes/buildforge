"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, DollarSign,
  Sparkles, AlertTriangle, FileText, ExternalLink,
} from "lucide-react";
import type { Database, InvoiceStatus, PaymentMethod } from "@/types/database";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Project = Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name">;
type CostCode = Pick<Database["public"]["Tables"]["cost_codes"]["Row"], "code" | "description">;

interface OpenPO {
  id: string;
  po_number: string | null;
  description: string | null;
  vendor_id: string | null;
  vendors: { name: string } | null;
}

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createClient();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable fields
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [costCode, setCostCode] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [paymentDate, setPaymentDate] = useState("");
  const [openPOs, setOpenPOs] = useState<OpenPO[]>([]);
  const [selectedPOId, setSelectedPOId] = useState<string>("");
  const [linkedPO, setLinkedPO] = useState<OpenPO | null>(null);
  const [savingPO, setSavingPO] = useState(false);

  useEffect(() => {
    async function load() {
      const [invRes, codesRes] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).single(),
        supabase.from("cost_codes").select("code, description").order("code"),
      ]);
      const inv = invRes.data as Invoice | null;
      if (!inv) return;
      setInvoice(inv);
      setVendor(inv.vendor ?? "");
      setInvoiceNumber(inv.invoice_number ?? "");
      setInvoiceDate(inv.invoice_date ?? "");
      setAmount(String(inv.amount ?? inv.total_amount ?? ""));
      setDueDate(inv.due_date ?? "");
      setCostCode(String(inv.cost_code ?? ""));
      setAiNotes(inv.ai_notes ?? "");
      setPaymentMethod((inv.payment_method as PaymentMethod) ?? "");
      setPaymentDate(inv.payment_date ?? "");
      setCostCodes((codesRes.data ?? []) as CostCode[]);
      if (inv.po_id) setSelectedPOId(inv.po_id);

      // Get project
      const projRes = await supabase.from("projects").select("id, name").eq("id", inv.project_id).single();
      setProject(projRes.data as Project | null);

      // Load open POs for the project
      if (inv.project_id) {
        const posRes = await supabase
          .from("purchase_orders")
          .select("id, po_number, description, vendor_id, vendors(name)")
          .eq("project_id", inv.project_id)
          .neq("status", "closed");
        const poList = (posRes.data ?? []) as unknown as OpenPO[];
        setOpenPOs(poList);
        // If already linked, find the PO
        if (inv.po_id) {
          const linked = poList.find((p) => p.id === inv.po_id);
          if (linked) setLinkedPO(linked);
        }
      }

      // Get file URL
      if (inv.file_path) {
        const { data } = await supabase.storage.from("invoices").createSignedUrl(inv.file_path, 3600);
        setFileUrl(data?.signedUrl ?? null);
      }
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveFields() {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("invoices").update({
      vendor: vendor || null,
      invoice_number: invoiceNumber || null,
      invoice_date: invoiceDate || null,
      amount: parseFloat(amount) || null,
      total_amount: parseFloat(amount) || null,
      due_date: dueDate || null,
      cost_code: costCode ? parseInt(costCode) : null,
      ai_notes: aiNotes || null,
    }).eq("id", id);
    setSaving(false);
    if (err) setError(err.message);
    else { setSuccess("Saved."); setTimeout(() => setSuccess(null), 2000); }
  }

  async function savePOLink() {
    setSavingPO(true);
    const poId = selectedPOId || null;
    await supabase.from("invoices").update({ po_id: poId }).eq("id", id);
    setInvoice((prev) => prev ? { ...prev, po_id: poId } : prev);
    const found = openPOs.find((p) => p.id === poId);
    setLinkedPO(found ?? null);
    setSavingPO(false);
  }

  async function setStatus(status: InvoiceStatus) {
    setSaving(true);
    setError(null);
    const updates: Partial<Invoice> = { status };
    if (status === "paid") {
      updates.payment_method = paymentMethod || null;
      updates.payment_date = paymentDate || new Date().toISOString().split("T")[0];
    }
    await supabase.from("invoices").update(updates).eq("id", id);
    setInvoice((prev) => prev ? { ...prev, ...updates } : prev);
    setSaving(false);
    if (status === "paid") router.push("/invoices");
  }

  if (!invoice) {
    return (
      <main className="flex-1 p-6">
        <div className="h-64 flex items-center justify-center">
          <div className="text-gray-400 text-sm">Loading…</div>
        </div>
      </main>
    );
  }

  const confidenceColor =
    invoice.ai_confidence === "high" ? "text-green-600 bg-green-50" :
    invoice.ai_confidence === "medium" ? "text-amber-600 bg-amber-50" :
    invoice.ai_confidence === "low" ? "text-red-600 bg-red-50" : "";

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <Link href="/invoices" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
          <ArrowLeft size={15} /> Accounts Payable
        </Link>

        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{invoice.vendor ?? invoice.file_name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{project?.name} · {fmtDate(invoice.invoice_date)}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Status badge */}
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              invoice.status === "paid" ? "bg-green-100 text-green-700" :
              invoice.status === "approved" ? "bg-blue-100 text-blue-700" :
              invoice.status === "disputed" ? "bg-red-100 text-red-700" :
              invoice.status === "scheduled" ? "bg-violet-100 text-violet-700" :
              "bg-amber-100 text-amber-700"
            }`}>
              {invoice.status.replace("_", " ")}
            </span>
            {fileUrl && (
              <a href={fileUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                <FileText size={14} /> View PDF <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>

        {/* AI confidence banner */}
        {invoice.ai_confidence === "low" && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
            <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">Low AI confidence — manual review required</p>
              {invoice.ai_notes && <p className="text-xs text-red-600 mt-0.5">{invoice.ai_notes}</p>}
            </div>
          </div>
        )}
        {invoice.ai_confidence && invoice.ai_confidence !== "low" && invoice.ai_notes && (
          <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 mb-5 ${confidenceColor} border-current border-opacity-20`}>
            <Sparkles size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium capitalize">{invoice.ai_confidence} confidence</p>
              <p className="text-xs mt-0.5">{invoice.ai_notes}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Edit fields */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Invoice Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vendor</label>
                  <input value={vendor} onChange={(e) => setVendor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Number</label>
                  <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Date</label>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                  <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Cost Code</label>
                  <select value={costCode} onChange={(e) => setCostCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                    <option value="">— Select cost code —</option>
                    {costCodes.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} — {c.description}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">AI Notes</label>
                <textarea value={aiNotes} onChange={(e) => setAiNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
              {success && <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">{success}</p>}
              <button onClick={saveFields} disabled={saving}
                className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>

          {/* Actions panel */}
          <div className="space-y-4">
            {/* Workflow actions */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900">Actions</h2>

              {invoice.status === "pending_review" && (
                <>
                  <button onClick={() => setStatus("approved")} disabled={saving}
                    className="w-full flex items-center gap-2 justify-center bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    <CheckCircle2 size={16} /> Approve Invoice
                  </button>
                  <button onClick={() => setStatus("disputed")} disabled={saving}
                    className="w-full flex items-center gap-2 justify-center bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-colors">
                    <XCircle size={16} /> Dispute
                  </button>
                </>
              )}

              {invoice.status === "approved" && (
                <>
                  <button onClick={() => setStatus("scheduled")} disabled={saving}
                    className="w-full flex items-center gap-2 justify-center bg-violet-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
                    <Clock size={16} /> Schedule Payment
                  </button>
                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <p className="text-xs font-medium text-gray-500">Record as Paid</p>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                      <option value="">Payment method…</option>
                      <option value="check">Check</option>
                      <option value="ach">ACH</option>
                      <option value="wire">Wire</option>
                      <option value="credit_card">Credit Card</option>
                    </select>
                    <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    <button onClick={() => setStatus("paid")} disabled={saving || !paymentMethod}
                      className="w-full flex items-center gap-2 justify-center bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                      <DollarSign size={16} /> Mark as Paid
                    </button>
                  </div>
                </>
              )}

              {invoice.status === "scheduled" && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500">Record Payment</p>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                    <option value="">Payment method…</option>
                    <option value="check">Check</option>
                    <option value="ach">ACH</option>
                    <option value="wire">Wire</option>
                    <option value="credit_card">Credit Card</option>
                  </select>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <button onClick={() => setStatus("paid")} disabled={saving || !paymentMethod}
                    className="w-full flex items-center gap-2 justify-center bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                    <DollarSign size={16} /> Mark as Paid
                  </button>
                </div>
              )}

              {invoice.status === "disputed" && (
                <button onClick={() => setStatus("pending_review")} disabled={saving}
                  className="w-full flex items-center gap-2 justify-center bg-amber-500 text-gray-900 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                  Return to Review
                </button>
              )}

              {invoice.status === "paid" && (
                <div className="text-center py-4">
                  <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-700">Paid</p>
                  {invoice.payment_date && <p className="text-xs text-gray-400 mt-1">{fmtDate(invoice.payment_date)}</p>}
                  {invoice.payment_method && <p className="text-xs text-gray-400 capitalize">{invoice.payment_method.replace("_", " ")}</p>}
                </div>
              )}
            </div>

            {/* Link to PO */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900">Link to PO</h2>
              {linkedPO && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  <span className="font-medium">Linked:</span> {linkedPO.po_number} — {linkedPO.description}
                  {linkedPO.vendors && <span className="text-amber-600"> ({linkedPO.vendors.name})</span>}
                </div>
              )}
              {openPOs.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={selectedPOId}
                    onChange={(e) => setSelectedPOId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— No PO linked —</option>
                    {openPOs.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.po_number} — {po.description}{po.vendors ? ` (${po.vendors.name})` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={savePOLink}
                    disabled={savingPO}
                    className="w-full bg-amber-500 text-gray-900 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors"
                  >
                    {savingPO ? "Saving…" : "Save PO Link"}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400">No open POs found for this project.</p>
              )}
            </div>

            {/* Summary card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
              <h2 className="font-semibold text-gray-900 mb-3">Summary</h2>
              {[
                { label: "Amount", value: fmt(parseFloat(amount) || null) },
                { label: "Project", value: project?.name ?? "—" },
                { label: "Invoice Date", value: fmtDate(invoiceDate || null) },
                { label: "Due Date", value: fmtDate(dueDate || null) },
                { label: "Source", value: invoice.source },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className="font-medium text-gray-900 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
