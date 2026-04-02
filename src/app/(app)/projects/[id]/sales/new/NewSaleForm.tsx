// @ts-nocheck
"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SaleType } from "@/types/database";

const SALE_TYPES: { value: SaleType; label: string }[] = [
  { value: "lot_sale", label: "Lot Sale" },
  { value: "house_sale", label: "House Sale" },
  { value: "progress_payment", label: "Progress Payment" },
  { value: "deposit", label: "Deposit" },
  { value: "variation", label: "Variation" },
  { value: "other", label: "Other" },
];

export default function NewSaleForm() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    sale_type: "other" as SaleType,
    description: "",
    buyer_name: "",
    contract_price: "",
    deposit_amount: "",
    deposit_received_date: "",
    settlement_date: "",
    is_settled: false,
    settled_amount: "",
    settled_date: "",
    notes: "",
  });

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase.from("sales").insert({
      project_id: projectId,
      sale_type: form.sale_type,
      description: form.description,
      buyer_name: form.buyer_name || null,
      contract_price: parseFloat(form.contract_price) || null,
      deposit_amount: parseFloat(form.deposit_amount) || null,
      deposit_received_date: form.deposit_received_date || null,
      settlement_date: form.settlement_date || null,
      is_settled: form.is_settled,
      settled_amount: form.is_settled ? (parseFloat(form.settled_amount) || null) : null,
      settled_date: form.is_settled ? (form.settled_date || null) : null,
      notes: form.notes || null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
    } else {
      router.push(`/projects/${projectId}?tab=sales`);
      router.refresh();
    }
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <Link href={`/projects/${projectId}?tab=sales`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Back to Project
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Sale / Revenue Entry</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sale Type</label>
                <select value={form.sale_type} onChange={(e) => set("sale_type", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {SALE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Name</label>
                <input type="text" value={form.buyer_name} onChange={(e) => set("buyer_name", e.target.value)}
                  placeholder="e.g. John Smith" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
              <input type="text" required value={form.description} onChange={(e) => set("description", e.target.value)}
                placeholder="e.g. Lot 12 — Riverside Estate" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contract Price (AUD)</label>
                <input type="number" min="0" step="0.01" value={form.contract_price} onChange={(e) => set("contract_price", e.target.value)}
                  placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Amount (AUD)</label>
                <input type="number" min="0" step="0.01" value={form.deposit_amount} onChange={(e) => set("deposit_amount", e.target.value)}
                  placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Received</label>
                <input type="date" value={form.deposit_received_date} onChange={(e) => set("deposit_received_date", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Settlement Date</label>
                <input type="date" value={form.settlement_date} onChange={(e) => set("settlement_date", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Settled toggle */}
            <div className="border-t border-gray-100 pt-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.is_settled} onChange={(e) => set("is_settled", e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-medium text-gray-700">Mark as settled / funds received</span>
              </label>

              {form.is_settled && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Settled Amount (AUD)</label>
                    <input type="number" min="0" step="0.01" value={form.settled_amount} onChange={(e) => set("settled_amount", e.target.value)}
                      placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Settled Date</label>
                    <input type="date" value={form.settled_date} onChange={(e) => set("settled_date", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving..." : "Save Sale"}
              </button>
              <Link href={`/projects/${projectId}?tab=sales`}
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
