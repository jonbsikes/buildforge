// @ts-nocheck
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LoanType } from "@/types/database";

interface Contact { id: string; name: string; }
interface Props { projectId: string; contacts: Contact[]; }

export default function NewLoanForm({ projectId, contacts }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    lender_id: "", loan_number: "", loan_type: "construction" as LoanType,
    total_amount: "", interest_rate: "", rate_type: "fixed",
    origination_date: "", maturity_date: "",
  });

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { error: err } = await supabase.from("loans").insert({
      project_id: projectId,
      lender_id: form.lender_id || null,
      loan_number: form.loan_number || null,
      loan_type: form.loan_type,
      total_amount: parseFloat(form.total_amount) || 0,
      interest_rate: parseFloat(form.interest_rate) / 100 || 0,
      rate_type: form.rate_type,
      origination_date: form.origination_date || null,
      maturity_date: form.maturity_date || null,
      status: "active",
    });
    if (err) { setError(err.message); setSaving(false); }
    else router.push(`/projects/${projectId}/loans`);
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-xl mx-auto">
        <Link href={`/projects/${projectId}/loans`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Loans
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Add Loan</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loan Type</label>
                <select value={form.loan_type} onChange={(e) => set("loan_type", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="construction">Construction</option>
                  <option value="land">Land</option>
                  <option value="lot">Lot</option>
                  <option value="bridge">Bridge</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loan Number</label>
                <input value={form.loan_number} onChange={(e) => set("loan_number", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Lender</label>
                <select value={form.lender_id} onChange={(e) => set("lender_id", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="">— No lender —</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Commitment ($) <span className="text-red-500">*</span></label>
                <input required type="number" min="0" step="1000" value={form.total_amount} onChange={(e) => set("total_amount", e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interest Rate (% annual)</label>
                <input type="number" min="0" max="100" step="0.01" value={form.interest_rate} onChange={(e) => set("interest_rate", e.target.value)}
                  placeholder="e.g. 7.25"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rate Type</label>
                <select value={form.rate_type} onChange={(e) => set("rate_type", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="fixed">Fixed</option>
                  <option value="variable">Variable</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Origination Date</label>
                <input type="date" value={form.origination_date} onChange={(e) => set("origination_date", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maturity Date</label>
                <input type="date" value={form.maturity_date} onChange={(e) => set("maturity_date", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-amber-500 text-gray-900 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Add Loan"}
              </button>
              <Link href={`/projects/${projectId}/loans`}
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
