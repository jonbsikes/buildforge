"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Project { id: string; name: string; }
interface Vendor { id: string; name: string; }
interface CostCode { code: number; category: string; description: string; }

interface Props { projects: Project[]; vendors: Vendor[]; costCodes: CostCode[]; nextPONumber: string; }

export default function NewPOForm({ projects, vendors, costCodes, nextPONumber }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    project_id: projects[0]?.id ?? "",
    vendor_id: "",
    cost_code: "",
    po_number: nextPONumber,
    description: "",
    amount: "",
    status: "draft",
    issued_date: "",
  });

  function set(field: string, value: string) { setForm((f) => ({ ...f, [field]: value })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { error: err } = await supabase.from("purchase_orders").insert({
      project_id: form.project_id,
      vendor_id: form.vendor_id || null,
      cost_code: form.cost_code ? parseInt(form.cost_code) : null,
      po_number: form.po_number,
      description: form.description,
      amount: parseFloat(form.amount) || 0,
      status: form.status as "draft" | "sent" | "acknowledged" | "closed",
      issued_date: form.issued_date || null,
      created_by: user.id,
    });
    if (err) { setError(err.message); setSaving(false); return; }

    // Recalculate committed_amount if cost_code is set
    if (form.cost_code && form.project_id) {
      const costCode = parseInt(form.cost_code);
      const projectId = form.project_id;

      const [posRes, contractsRes] = await Promise.all([
        supabase
          .from("purchase_orders")
          .select("amount")
          .eq("project_id", projectId)
          .eq("cost_code", costCode)
          .neq("status", "closed"),
        supabase
          .from("contracts")
          .select("id, contract_amount")
          .eq("project_id", projectId)
          .eq("cost_code", costCode)
          .neq("status", "complete"),
      ]);

      const poSum = (posRes.data ?? []).reduce((s: number, r: { amount: number | null }) => s + (r.amount ?? 0), 0);
      let contractSum = 0;
      const contractIds = (contractsRes.data ?? []).map((c: { id: string; contract_amount: number | null }) => {
        contractSum += c.contract_amount ?? 0;
        return c.id;
      });

      if (contractIds.length > 0) {
        const coRes = await supabase
          .from("change_orders")
          .select("amount")
          .in("contract_id", contractIds)
          .eq("status", "approved");
        contractSum += (coRes.data ?? []).reduce((s: number, r: { amount: number | null }) => s + (r.amount ?? 0), 0);
      }

      const committed = poSum + contractSum;
      const { data: existing } = await supabase
        .from("project_budget")
        .select("id")
        .eq("project_id", projectId)
        .eq("cost_code", costCode)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("project_budget")
          .update({ committed_amount: committed })
          .eq("project_id", projectId)
          .eq("cost_code", costCode);
      } else {
        await supabase.from("project_budget").insert({
          project_id: projectId,
          cost_code: costCode,
          committed_amount: committed,
          budgeted_amount: 0,
          actual_amount: 0,
        });
      }
    }

    router.push("/purchase-orders");
  }

  const landCodes = costCodes.filter((c) => c.category === "Land Development");
  const homeCodes = costCodes.filter((c) => c.category === "Home Construction");

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <Link href="/purchase-orders" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Purchase Orders
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">New Purchase Order</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PO Number</label>
                <input value={form.po_number} onChange={(e) => set("po_number", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="acknowledged">Acknowledged</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project <span className="text-red-500">*</span></label>
                <select required value={form.project_id} onChange={(e) => set("project_id", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <select value={form.vendor_id} onChange={(e) => set("vendor_id", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">— No vendor —</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost Code</label>
                <select value={form.cost_code} onChange={(e) => set("cost_code", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">— Select cost code —</option>
                  <optgroup label="Land Development (1–33)">
                    {landCodes.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
                  </optgroup>
                  <optgroup label="Home Construction (34–102)">
                    {homeCodes.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.description}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
                <input required value={form.description} onChange={(e) => set("description", e.target.value)}
                  placeholder="What is this PO for?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issued Date</label>
                <input type="date" value={form.issued_date} onChange={(e) => set("issued_date", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-amber-500 text-gray-900 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Create PO"}
              </button>
              <Link href="/purchase-orders"
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
