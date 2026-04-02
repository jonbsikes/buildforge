// @ts-nocheck
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, TrendingUp, AlertTriangle, Check, X } from "lucide-react";

interface CostCode { code: number; category: string; description: string; }
interface BudgetRow { id: string; project_id: string; cost_code: number; budgeted_amount: number; committed_amount: number; actual_amount: number; }

interface Props {
  projectId: string;
  contractPrice: number | null;
  budgetRows: BudgetRow[];
  costCodes: CostCode[];
  invoiceActuals: Record<number, number>;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function BudgetClient({ projectId, contractPrice, budgetRows: initial, costCodes, invoiceActuals }: Props) {
  const supabase = createClient();
  const [rows, setRows] = useState<BudgetRow[]>(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBudget, setEditBudget] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [saving, setSaving] = useState(false);

  const codeMap = Object.fromEntries(costCodes.map((c) => [c.code, c]));
  const usedCodes = new Set(rows.map((r) => r.cost_code));

  const totalBudgeted = rows.reduce((s, r) => s + r.budgeted_amount, 0);
  const totalActual = rows.reduce((s, r) => s + (invoiceActuals[r.cost_code] ?? r.actual_amount), 0);
  const totalCommitted = rows.reduce((s, r) => s + r.committed_amount, 0);
  const profit = contractPrice != null ? contractPrice - totalActual : null;

  async function handleAddRow() {
    if (!newCode || !newBudget) return;
    setSaving(true);
    const { data, error } = await supabase.from("project_budget").insert({
      project_id: projectId,
      cost_code: parseInt(newCode),
      budgeted_amount: parseFloat(newBudget),
      committed_amount: 0,
      actual_amount: 0,
    }).select("*").single();
    if (!error && data) {
      setRows((r) => [...r, data as BudgetRow].sort((a, b) => a.cost_code - b.cost_code));
      setNewCode("");
      setNewBudget("");
      setAdding(false);
    }
    setSaving(false);
  }

  async function handleEditSave(id: string) {
    setSaving(true);
    const { error } = await supabase.from("project_budget").update({ budgeted_amount: parseFloat(editBudget) || 0 }).eq("id", id);
    if (!error) setRows((prev) => prev.map((r) => r.id === id ? { ...r, budgeted_amount: parseFloat(editBudget) || 0 } : r));
    setEditingId(null);
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("project_budget").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const landRows = rows.filter((r) => codeMap[r.cost_code]?.category === "Land Development");
  const homeRows = rows.filter((r) => codeMap[r.cost_code]?.category === "Home Construction");

  function renderGroup(label: string, groupRows: BudgetRow[]) {
    if (groupRows.length === 0) return null;
    const groupTotal = groupRows.reduce((s, r) => s + r.budgeted_amount, 0);
    const groupActual = groupRows.reduce((s, r) => s + (invoiceActuals[r.cost_code] ?? r.actual_amount), 0);
    return (
      <div key={label} className="mb-2">
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <span>{label}</span>
          <span>{fmt(groupActual)} / {fmt(groupTotal)}</span>
        </div>
        {groupRows.map((row) => {
          const actual = invoiceActuals[row.cost_code] ?? row.actual_amount;
          const budget = row.budgeted_amount;
          const variance = budget - actual;
          const over = variance < 0;
          const pct = budget > 0 ? Math.min((actual / budget) * 100, 100) : 0;
          const code = codeMap[row.cost_code];
          return (
            <div key={row.id} className="px-5 py-3 border-b border-gray-50 hover:bg-gray-50 group">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">{row.cost_code}</span>
                    <span className="text-sm text-gray-800 truncate">{code?.description ?? "Unknown"}</span>
                    {over && <AlertTriangle size={13} className="text-red-500 shrink-0" />}
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${over ? "bg-red-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0 min-w-[200px]">
                  <div className="flex items-center gap-4 justify-end">
                    {editingId === row.id ? (
                      <div className="flex items-center gap-1">
                        <input type="number" value={editBudget} onChange={(e) => setEditBudget(e.target.value)}
                          className="w-28 px-2 py-1 border border-amber-400 rounded text-xs focus:outline-none" autoFocus />
                        <button onClick={() => handleEditSave(row.id)} disabled={saving} className="text-green-600 hover:text-green-700"><Check size={14} /></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingId(row.id); setEditBudget(String(row.budgeted_amount)); }}
                        className="text-xs text-gray-400 hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        Edit
                      </button>
                    )}
                    <div className="text-xs text-gray-400 w-24 text-right">Budget: {fmt(budget)}</div>
                    <div className={`text-sm font-medium w-24 text-right ${over ? "text-red-600" : "text-gray-700"}`}>
                      Actual: {fmt(actual)}
                    </div>
                    <div className={`text-xs w-24 text-right font-medium ${over ? "text-red-500" : "text-green-600"}`}>
                      {over ? "-" : "+"}{fmt(Math.abs(variance))}
                    </div>
                    <button onClick={() => handleDelete(row.id)} className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs">×</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Budgeted", value: fmt(totalBudgeted), color: "text-gray-900" },
          { label: "Committed", value: fmt(totalCommitted), color: "text-violet-600" },
          { label: "Actual Spend", value: fmt(totalActual), color: totalActual > totalBudgeted ? "text-red-600" : "text-gray-900" },
          { label: contractPrice != null ? "Est. Profit" : "Contract Price", value: profit != null ? fmt(profit) : "—", color: profit != null ? (profit >= 0 ? "text-green-600" : "text-red-600") : "text-gray-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Budget table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Budget by Cost Code</h2>
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400 transition-colors font-medium">
            <Plus size={14} /> Add Line
          </button>
        </div>

        {/* Add row form */}
        {adding && (
          <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-amber-800 mb-1">Cost Code</label>
              <select value={newCode} onChange={(e) => setNewCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">Select code…</option>
                <optgroup label="Land Development (1–33)">
                  {costCodes.filter((c) => c.category === "Land Development" && !usedCodes.has(c.code)).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.description}</option>
                  ))}
                </optgroup>
                <optgroup label="Home Construction (34–102)">
                  {costCodes.filter((c) => c.category === "Home Construction" && !usedCodes.has(c.code)).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.description}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="w-36">
              <label className="block text-xs font-medium text-amber-800 mb-1">Budgeted Amount ($)</label>
              <input type="number" min="0" step="100" value={newBudget} onChange={(e) => setNewBudget(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddRow} disabled={saving || !newCode}
                className="bg-amber-500 text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                Add
              </button>
              <button onClick={() => setAdding(false)}
                className="border border-gray-300 px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {rows.length === 0 && !adding ? (
          <div className="px-5 py-12 text-center">
            <TrendingUp size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No budget lines yet.</p>
            <button onClick={() => setAdding(true)} className="mt-2 text-sm text-amber-600 hover:underline">Add the first budget line</button>
          </div>
        ) : (
          <div>
            {renderGroup("Land Development", landRows)}
            {renderGroup("Home Construction", homeRows)}
          </div>
        )}
      </div>
   