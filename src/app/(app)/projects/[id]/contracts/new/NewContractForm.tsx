// @ts-nocheck
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Vendor { id: string; name: string; }
interface CostCode { code: number; category: string; description: string; }

interface Props {
  projectId: string;
  projectName: string;
  vendors: Vendor[];
  costCodes: CostCode[];
}

export default function NewContractForm({ projectId, projectName, vendors, costCodes }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vendor_id: "",
    cost_code: "",
    description: "",
    contract_amount: "",
    status: "draft" as "draft" | "active" | "complete",
    signed_date: "",
  });

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function recalcCommitted(costCode: number) {
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

    const poSum = (posRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

    let contractSum = 0;
    const contractIds = (contractsRes.data ?? []).map((c) => {
      contractSum += c.contract_amount ?? 0;
      return c.id as string;
    });

    if (contractIds.length > 0) {
      const coRes = await supabase
        .from("change_orders")
        .select("amount")
        .in("contract_id", contractIds)
        .eq("status", "approved");
      contractSum += (coRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error: err } = await supabase.from("contracts").insert({
      project_id: projectId,
      vendor_id: form.vendor_id || null,
      cost_code: form.cost_code ? parseInt(form.cost_code) : null,
      description: form.description,
      contract_amount: parseFloat(form.contract_amount) || 0,
      status: form.status,
      signed_date: form.signed_date || null,
    });

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    if (form.cost_code) {
      await recalcCommitted(parseInt(form.cost_code));
    }

    router.push(`/projects/${projectId}/contracts`);
  }

  const landCodes = costCodes.filter((c) => c.category === "Land Development");
  const homeCodes = costCodes.filter((c) => c.category === "Home Construction");

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <Link href={`/projects/${projectId}/contracts`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> {projectName} / Contracts
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">New Contract</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <select value={form.vendor_id} onChange={(e) => set("vendor_id", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">— No vendor —</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="complete">Complete</option>
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
                  placeholder="Contract description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Amount ($)</label>
                <input type="number" min="0" step="0.01" value={form.contract_amount} onChange={(e) => set("contract_amount", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Signed Date</label>
                <input type="date" value={form.signed_date} onChange={(e) => set("signed_date", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-amber-500 text-gray-900 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Create Contract"}
              </button>
              <Link href={`/projects/${projectId}/contracts`}
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
