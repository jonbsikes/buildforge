// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, Plus, Check, X } from "lucide-react";

interface Contract {
  id: string;
  project_id: string;
  vendor_id: string | null;
  cost_code: number | null;
  description: string | null;
  contract_amount: number | null;
  status: string | null;
  signed_date: string | null;
  vendors: { name: string } | null;
}

interface ChangeOrder {
  id: string;
  contract_id: string;
  description: string | null;
  amount: number | null;
  status: string | null;
  created_at: string | null;
}

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ContractDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const contractId = params.contractId as string;
  const supabase = createClient();

  const [contract, setContract] = useState<Contract | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showNewCO, setShowNewCO] = useState(false);
  const [newCO, setNewCO] = useState({ description: "", amount: "" });

  useEffect(() => {
    async function load() {
      const [cRes, coRes] = await Promise.all([
        supabase
          .from("contracts")
          .select("*, vendors(name)")
          .eq("id", contractId)
          .single(),
        supabase
          .from("change_orders")
          .select("*")
          .eq("contract_id", contractId)
          .order("created_at", { ascending: false }),
      ]);
      if (cRes.data) setContract(cRes.data as Contract);
      setChangeOrders((coRes.data ?? []) as ChangeOrder[]);
      setLoading(false);
    }
    load();
  }, [contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function recalcCommitted() {
    if (!contract?.cost_code) return;
    const costCode = contract.cost_code;

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

  async function addChangeOrder() {
    if (!newCO.description) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("change_orders")
      .insert({
        contract_id: contractId,
        description: newCO.description,
        amount: parseFloat(newCO.amount) || 0,
        status: "pending",
      })
      .select("*")
      .single();

    if (!error && data) {
      setChangeOrders((prev) => [data as ChangeOrder, ...prev]);
      setNewCO({ description: "", amount: "" });
      setShowNewCO(false);
    }
    setSaving(false);
  }

  async function updateCOStatus(co: ChangeOrder, status: "approved" | "rejected") {
    setSaving(true);
    await supabase.from("change_orders").update({ status }).eq("id", co.id);
    setChangeOrders((prev) => prev.map((c) => c.id === co.id ? { ...c, status } : c));
    await recalcCommitted();
    setSaving(false);
  }

  if (loading) return <main className="flex-1 p-6"><div className="text-gray-400 text-sm">Loading…</div></main>;
  if (!contract) return <main className="flex-1 p-6"><div className="text-gray-400 text-sm">Contract not found.</div></main>;

  const approvedCOs = changeOrders.filter((co) => co.status === "approved");
  const effectiveAmount = (contract.contract_amount ?? 0) + approvedCOs.reduce((s, co) => s + (co.amount ?? 0), 0);

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    complete: "bg-blue-100 text-blue-700",
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <Link href={`/projects/${projectId}/contracts`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
          <ArrowLeft size={15} /> Contracts
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{contract.description}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{contract.vendors?.name ?? "No vendor"}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[contract.status ?? "draft"]}`}>
              {contract.status ?? "draft"}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Contract Amount</p>
              <p className="font-semibold text-gray-900">{fmt(contract.contract_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Effective Amount</p>
              <p className={`font-semibold ${effectiveAmount !== (contract.contract_amount ?? 0) ? "text-amber-600" : "text-gray-900"}`}>
                {fmt(effectiveAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Cost Code</p>
              <p className="font-medium text-gray-900 font-mono">{contract.cost_code ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Signed Date</p>
              <p className="font-medium text-gray-900">{fmtDate(contract.signed_date)}</p>
            </div>
          </div>
        </div>

        {/* Change Orders */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Change Orders</h2>
            <button
              onClick={() => setShowNewCO(true)}
              className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400 font-medium"
            >
              <Plus size={14} /> Add Change Order
            </button>
          </div>

          {showNewCO && (
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-100">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <input
                    value={newCO.description}
                    onChange={(e) => setNewCO((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Change order description"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (+ or −)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newCO.amount}
                    onChange={(e) => setNewCO((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addChangeOrder}
                  disabled={saving || !newCO.description}
                  className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400 disabled:opacity-50 font-medium"
                >
                  <Check size={12} /> Save
                </button>
                <button
                  onClick={() => { setShowNewCO(false); setNewCO({ description: "", amount: "" }); }}
                  className="inline-flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          )}

          {changeOrders.length === 0 && !showNewCO ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">No change orders yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {changeOrders.map((co) => (
                <div key={co.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{co.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(co.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-medium text-sm ${(co.amount ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {(co.amount ?? 0) >= 0 ? "+" : ""}{fmt(co.amount)}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[co.status ?? "pending"]}`}>
                      {co.status ?? "pending"}
                    </span>
                    {co.status === "pending" && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateCOStatus(co, "approved")}
                          disabled={saving}
                          className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => updateCOStatus(co, "rejected")}
                          disabled={saving}
                          className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
