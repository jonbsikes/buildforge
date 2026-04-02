"use client";

import { useState, useTransition, useMemo } from "react";
import { Pencil, Check, X, LayoutList, Save } from "lucide-react";
import type { CostCode } from "@/components/projects/ProjectTabs";
import { updateCostCodeBudget } from "@/app/actions/projects";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

interface Props {
  costCodes: CostCode[];
  committedByCostCodeId: Record<string, number>;
  actualByCostCodeId: Record<string, number>;
}

function SummaryCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{fmt(value)}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function BudgetCell({
  pccId, value, projectId, onSaved,
}: {
  pccId: string; value: number; projectId?: string; onSaved: (val: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!pccId) {
    return <span className="text-gray-300">—</span>;
  }

  function save() {
    const n = parseFloat(draft.replace(/,/g, ""));
    if (isNaN(n) || n < 0) { setErr("Invalid amount"); return; }
    setErr(null);
    startTransition(async () => {
      const res = await updateCostCodeBudget(pccId, n);
      if (res.error) { setErr(res.error); return; }
      onSaved(n);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <span className="text-gray-400 text-xs">$</span>
        <input
          type="number"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-24 px-1.5 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#4272EF] text-right"
          autoFocus
        />
        <button onClick={save} disabled={isPending} className="text-[#4272EF] hover:text-[#3461de] disabled:opacity-50">
          <Check size={13} />
        </button>
        <button onClick={() => { setEditing(false); setErr(null); }} className="text-gray-400 hover:text-gray-600">
          <X size={13} />
        </button>
        {err && <span className="text-red-500 text-xs">{err}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="group flex items-center justify-end gap-1 w-full text-right text-gray-700 hover:text-[#4272EF] transition-colors"
      title="Click to edit budget"
    >
      {value > 0 ? fmt(value) : <span className="text-gray-300">—</span>}
      <Pencil size={11} className="opacity-0 group-hover:opacity-100 text-gray-400 flex-shrink-0" />
    </button>
  );
}

export default function BudgetTab({ costCodes, committedByCostCodeId, actualByCostCodeId }: Props) {
  const [budgets, setBudgets] = useState<Record<string, number>>(
    Object.fromEntries(costCodes.map((cc) => [cc.id, cc.budgeted_amount ?? 0]))
  );
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkDrafts, setBulkDrafts] = useState<Record<string, string>>({});
  const [isSavingBulk, startBulkTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);

  function enterBulk() {
    setBulkDrafts(Object.fromEntries(costCodes.map((cc) => [cc.id, String(budgets[cc.id] ?? 0)])));
    setBulkMode(true);
    setBulkError(null);
  }

  function saveBulk() {
    const updates: { pccId: string; id: string; value: number }[] = [];
    for (const cc of costCodes) {
      const raw = bulkDrafts[cc.id] ?? "";
      const n = parseFloat(raw.replace(/,/g, "")) || 0;
      if (n < 0) { setBulkError(`Invalid amount for ${cc.code}`); return; }
      if (n !== (budgets[cc.id] ?? 0)) updates.push({ pccId: cc.pccId, id: cc.id, value: n });
    }
    setBulkError(null);
    startBulkTransition(async () => {
      for (const u of updates) {
        await updateCostCodeBudget(u.pccId, u.value);
        setBudgets((prev) => ({ ...prev, [u.id]: u.value }));
      }
      setBulkMode(false);
    });
  }

  const rows = useMemo(() =>
    costCodes.map((cc) => {
      const budget = budgets[cc.id] ?? 0;
      const committed = committedByCostCodeId[cc.id] ?? 0;
      const actual = actualByCostCodeId[cc.id] ?? 0;
      const variance = budget - actual;
      return { ...cc, budget, committed, actual, variance };
    }),
    [costCodes, budgets, committedByCostCodeId, actualByCostCodeId]
  );

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      committed: acc.committed + r.committed,
      actual: acc.actual + r.actual,
      variance: acc.variance + r.variance,
    }),
    { budget: 0, committed: 0, actual: 0, variance: 0 }
  ), [rows]);

  if (costCodes.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-400">
        No cost codes enabled for this project. Add cost codes in the Cost Items tab first.
      </div>
    );
  }

  const pctSpent = totals.budget > 0 ? Math.min(100, (totals.actual / totals.budget) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total Budget" value={totals.budget} color="text-gray-900" />
        <SummaryCard label="Committed" value={totals.committed} sub="active contracts" color="text-amber-700" />
        <SummaryCard label="Actual Spend" value={totals.actual} sub="approved / paid invoices" color="text-blue-700" />
        <SummaryCard
          label={totals.variance >= 0 ? "Under Budget" : "Over Budget"}
          value={Math.abs(totals.variance)}
          sub={totals.budget > 0 ? `${pctSpent.toFixed(1)}% spent` : undefined}
          color={totals.variance >= 0 ? "text-green-700" : "text-red-600"}
        />
      </div>

      {/* Progress bar */}
      {totals.budget > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>Budget utilization</span>
            <span>{pctSpent.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pctSpent >= 100 ? "bg-red-500" : pctSpent >= 80 ? "bg-amber-400" : "bg-[#4272EF]"}`}
              style={{ width: `${Math.min(100, pctSpent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Budget table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
          <span className="text-xs text-gray-400">Click any budget cell to edit inline, or use bulk edit to update all at once.</span>
          {bulkMode ? (
            <div className="flex items-center gap-2">
              {bulkError && <span className="text-xs text-red-500">{bulkError}</span>}
              <button
                onClick={() => setBulkMode(false)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={12} /> Cancel
              </button>
              <button
                onClick={saveBulk}
                disabled={isSavingBulk}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] transition-colors disabled:opacity-60"
              >
                <Save size={12} /> {isSavingBulk ? "Saving…" : "Save All"}
              </button>
            </div>
          ) : (
            <button
              onClick={enterBulk}
              className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <LayoutList size={12} /> Bulk Edit
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Code</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Description</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Budget</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Committed</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Actual</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wider">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{r.code}</td>
                <td className="px-4 py-2.5 text-gray-900">{r.name}</td>
                <td className="px-4 py-2.5 text-right">
                  {bulkMode ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={bulkDrafts[r.id] ?? "0"}
                      onChange={(e) => setBulkDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      className="w-28 px-2 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#4272EF] text-right"
                    />
                  ) : (
                    <BudgetCell
                      pccId={r.pccId}
                      value={r.budget}
                      onSaved={(val) => setBudgets((prev) => ({ ...prev, [r.id]: val }))}
                    />
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-amber-700">
                  {r.committed > 0 ? fmt(r.committed) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right text-blue-700">
                  {r.actual > 0 ? fmt(r.actual) : <span className="text-gray-300">—</span>}
                </td>
                <td className={`px-4 py-2.5 text-right font-medium ${
                  r.budget === 0 && r.actual === 0 ? "text-gray-300" :
                  r.variance < 0 ? "text-red-600" : "text-green-700"
                }`}>
                  {r.budget === 0 && r.actual === 0 ? "—" : (
                    <>{r.variance < 0 ? "−" : "+"}{fmt(Math.abs(r.variance))}</>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50">
              <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</td>
              <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmt(totals.budget)}</td>
              <td className="px-4 py-3 text-right text-sm font-semibold text-amber-700">{fmt(totals.committed)}</td>
              <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">{fmt(totals.actual)}</td>
              <td className={`px-4 py-3 text-right text-sm font-bold ${totals.variance < 0 ? "text-red-600" : "text-green-700"}`}>
                {totals.variance < 0 ? "−" : "+"}{fmt(Math.abs(totals.variance))}
              </td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Budget = project cost code budgets · Committed = active contracts · Actual = approved/paid invoices · Variance = Budget − Actual
      </p>
    </div>
  );
}
