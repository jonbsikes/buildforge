// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.min(100, Math.max(0, (num / den) * 100));
}

interface WIPRow {
  id: string;
  name: string;
  type: string;
  status: string;
  budget: number;
  committed: number;
  actual: number;
  pctComplete: number;
  remaining: number;
  loanAmount: number;
  underOver: number;
  ledgerWip: number;           // net balance of 1210 + 1220 from journal entries
  capitalizedInterest: number; // balance of 1220 specifically
}

export default function WIPClient() {
  const [rows, setRows] = useState<WIPRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("active");

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [projectsRes, budgetsRes, contractsRes, invoicesRes, loansRes, coaRes] = await Promise.all([
        supabase.from("projects").select("id, name, project_type, status").order("name"),
        supabase.from("project_cost_codes").select("project_id, budgeted_amount"),
        supabase.from("contracts").select("project_id, amount"),
        supabase.from("invoices").select("project_id, amount, total_amount").in("status", ["approved", "paid"]),
        supabase.from("loans").select("project_id, loan_amount"),
        supabase.from("chart_of_accounts").select("id, account_number").in("account_number", ["1210", "1220"]),
      ]);

      const projects = projectsRes.data ?? [];

      // Aggregate by project_id
      const budgetMap: Record<string, number> = {};
      for (const b of budgetsRes.data ?? []) {
        budgetMap[b.project_id] = (budgetMap[b.project_id] ?? 0) + (b.budgeted_amount ?? 0);
      }

      const committedMap: Record<string, number> = {};
      for (const c of contractsRes.data ?? []) {
        committedMap[c.project_id] = (committedMap[c.project_id] ?? 0) + (c.amount ?? 0);
      }

      const actualMap: Record<string, number> = {};
      for (const inv of invoicesRes.data ?? []) {
        if (inv.project_id) {
          actualMap[inv.project_id] = (actualMap[inv.project_id] ?? 0) + (inv.total_amount ?? inv.amount ?? 0);
        }
      }

      const loanMap: Record<string, number> = {};
      for (const l of loansRes.data ?? []) {
        loanMap[l.project_id] = (loanMap[l.project_id] ?? 0) + (l.loan_amount ?? 0);
      }

      // Pull ledger WIP balances (1210 + 1220) by project from posted journal entries
      const wipAcctId = (coaRes.data ?? []).find((a: any) => a.account_number === "1210")?.id;
      const intAcctId = (coaRes.data ?? []).find((a: any) => a.account_number === "1220")?.id;

      const ledgerWipMap: Record<string, number> = {};
      const capIntMap: Record<string, number> = {};

      if (wipAcctId || intAcctId) {
        const acctIds = [wipAcctId, intAcctId].filter(Boolean) as string[];
        const { data: ledgerLines } = await supabase
          .from("journal_entry_lines")
          .select("account_id, project_id, debit, credit, journal_entry:journal_entries(status)")
          .in("account_id", acctIds);

        for (const line of ledgerLines ?? []) {
          if ((line as any).journal_entry?.status !== "posted") continue;
          const pid = line.project_id;
          if (!pid) continue;
          const net = Number(line.debit) - Number(line.credit);
          if (line.account_id === wipAcctId) ledgerWipMap[pid] = (ledgerWipMap[pid] ?? 0) + net;
          if (line.account_id === intAcctId) capIntMap[pid] = (capIntMap[pid] ?? 0) + net;
        }
      }

      const wipRows: WIPRow[] = projects.map((p) => {
        const budget = budgetMap[p.id] ?? 0;
        const committed = committedMap[p.id] ?? 0;
        const actual = actualMap[p.id] ?? 0;
        const loanAmount = loanMap[p.id] ?? 0;
        const completePct = pct(actual, budget);
        const remaining = budget - actual;
        // Over/under = committed + actual vs budget
        const underOver = budget - (committed + actual);

        return {
          id: p.id,
          name: p.name,
          type: p.project_type,
          status: p.status,
          budget,
          committed,
          actual,
          pctComplete: completePct,
          remaining,
          loanAmount,
          underOver,
          ledgerWip: (ledgerWipMap[p.id] ?? 0) + (capIntMap[p.id] ?? 0),
          capitalizedInterest: capIntMap[p.id] ?? 0,
        };
      });

      setRows(wipRows);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = filterStatus ? rows.filter((r) => r.status === filterStatus) : rows;

  const totals = filtered.reduce(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      committed: acc.committed + r.committed,
      actual: acc.actual + r.actual,
      loanAmount: acc.loanAmount + r.loanAmount,
    }),
    { budget: 0, committed: 0, actual: 0, loanAmount: 0 }
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Projects Shown</p>
          <p className="text-xl font-semibold text-gray-900">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Total Budgeted</p>
          <p className="text-xl font-semibold text-gray-900">{fmt(totals.budget)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Ledger WIP Balance</p>
          <p className="text-xl font-semibold text-[#4272EF]">{fmt(filtered.reduce((s, r) => s + r.ledgerWip, 0))}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">from posted journal entries</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Total Loan Amt</p>
          <p className="text-xl font-semibold text-gray-900">{fmt(totals.loanAmount)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All Statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
        </select>
        <div className="ml-auto">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <FileDown size={15} /> Export PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No projects found.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
            <h2 className="text-sm font-semibold text-white">Work In Progress Report</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                  <th className="text-left px-5 py-2.5">Project</th>
                  <th className="text-left px-5 py-2.5">Type</th>
                  <th className="text-left px-5 py-2.5">Status</th>
                  <th className="text-right px-5 py-2.5">Budget</th>
                  <th className="text-right px-5 py-2.5">Committed</th>
                  <th className="text-right px-5 py-2.5">Actual Cost</th>
                  <th className="text-right px-5 py-2.5">Ledger WIP</th>
                  <th className="text-right px-5 py-2.5">Cap. Interest</th>
                  <th className="text-right px-5 py-2.5">% Complete</th>
                  <th className="text-right px-5 py-2.5">Remaining</th>
                  <th className="text-right px-5 py-2.5">Loan Amt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{r.name}</td>
                    <td className="px-5 py-3 text-xs text-gray-500">
                      {r.type === "home_construction" ? "Home" : "Land Dev"}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === "active" ? "bg-green-100 text-green-700" :
                        r.status === "planning" ? "bg-gray-100 text-gray-600" :
                        r.status === "on_hold" ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">{r.budget > 0 ? fmt(r.budget) : "—"}</td>
                    <td className="px-5 py-3 text-right text-amber-700">{r.committed > 0 ? fmt(r.committed) : "—"}</td>
                    <td className="px-5 py-3 text-right text-blue-700">{r.actual > 0 ? fmt(r.actual) : "—"}</td>
                    <td className="px-5 py-3 text-right font-medium" style={{ color: r.ledgerWip > 0 ? "#4272EF" : undefined }}>{r.ledgerWip > 0 ? fmt(r.ledgerWip) : "—"}</td>
                    <td className="px-5 py-3 text-right text-gray-500 text-xs">{r.capitalizedInterest > 0 ? fmt(r.capitalizedInterest) : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {r.budget > 0 ? (
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${r.pctComplete >= 100 ? "bg-red-400" : r.pctComplete >= 80 ? "bg-amber-400" : "bg-[#4272EF]"}`}
                              style={{ width: `${Math.min(100, r.pctComplete)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 w-10 text-right">{r.pctComplete.toFixed(0)}%</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${r.remaining < 0 ? "text-red-600" : "text-green-700"}`}>
                      {r.budget > 0 ? (r.remaining < 0 ? `−${fmt(Math.abs(r.remaining))}` : fmt(r.remaining)) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">{r.loanAmount > 0 ? fmt(r.loanAmount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td colSpan={3} className="px-5 py-3 text-xs uppercase text-gray-600">Totals</td>
                  <td className="px-5 py-3 text-right text-gray-900">{fmt(totals.budget)}</td>
                  <td className="px-5 py-3 text-right text-amber-700">{fmt(totals.committed)}</td>
                  <td className="px-5 py-3 text-right text-blue-700">{fmt(totals.actual)}</td>
                  <td className="px-5 py-3 text-right font-semibold" style={{ color: "#4272EF" }}>{fmt(filtered.reduce((s, r) => s + r.ledgerWip, 0))}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{fmt(filtered.reduce((s, r) => s + r.capitalizedInterest, 0))}</td>
                  <td />
                  <td className="px-5 py-3 text-right text-gray-900">{fmt(totals.budget - totals.actual)}</td>
                  <td className="px-5 py-3 text-right text-gray-900">{fmt(totals.loanAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
