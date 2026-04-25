"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

interface CostCode {
  id: string;
  pccId: string;
  budgeted_amount: number;
  code: string;
  name: string;
  category: string;
  sort_order: number | null;
}

interface Props {
  projectId: string;
  costCodes: CostCode[];
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function BudgetTab({ projectId, costCodes }: Props) {
  const [codes, setCodes] = useState(costCodes);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const totalBudget = codes.reduce((s, c) => s + c.budgeted_amount, 0);

  function startEdit(pccId: string, current: number) {
    setEditingId(pccId);
    setEditValue(current > 0 ? String(current) : "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  function saveEdit(pccId: string) {
    const num = parseFloat(editValue) || 0;
    if (num < 0) {
      setError("Budget cannot be negative");
      return;
    }
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("project_cost_codes")
        .update({ budgeted_amount: num })
        .eq("id", pccId);

      if (err) {
        setError(err.message);
        return;
      }
      setCodes((prev) =>
        prev.map((c) => (c.pccId === pccId ? { ...c, budgeted_amount: num } : c))
      );
      setEditingId(null);
      setEditValue("");
    });
  }

  function handleKeyDown(e: React.KeyboardEvent, pccId: string) {
    if (e.key === "Enter") saveEdit(pccId);
    if (e.key === "Escape") cancelEdit();
  }

  if (codes.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-6 text-center">
        No cost codes assigned to this project. Add cost codes from the Job Costs tab first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Budget by Cost Code</h3>
        <span className="text-sm font-medium text-gray-900">Total: {fmt(totalBudget)}</span>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded">{error}</p>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2.5 font-medium text-gray-600 w-20">Code</th>
              <th className="px-4 py-2.5 font-medium text-gray-600">Description</th>
              <th className="px-4 py-2.5 font-medium text-gray-600 text-right w-40">Budget</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c, i) => (
              <tr
                key={c.pccId}
                className={`border-t border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}
              >
                <td className="px-4 py-2 text-gray-500 tabular-nums">{c.code}</td>
                <td className="px-4 py-2 text-gray-800">{c.name}</td>
                <td className="px-4 py-2 text-right">
                  {editingId === c.pccId ? (
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, c.pccId)}
                      onBlur={() => saveEdit(c.pccId)}
                      autoFocus
                      disabled={isPending}
                      className="w-32 px-2 py-1 border border-[#4272EF] rounded text-right text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
                      placeholder="0"
                    />
                  ) : (
                    <button
                      onClick={() => startEdit(c.pccId, c.budgeted_amount)}
                      className="text-gray-700 tabular-nums hover:text-[#4272EF] hover:underline transition-colors cursor-pointer"
                    >
                      {c.budgeted_amount > 0 ? fmt(c.budgeted_amount) : "—"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
              <td className="px-4 py-2.5" colSpan={2}>Total Budget</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalBudget)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
