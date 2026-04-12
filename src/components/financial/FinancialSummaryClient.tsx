// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

interface ProjectRow {
  id: string;
  name: string;
  wip_balance: number;
  loan_balance: number;
}

interface SummaryData {
  cash: number;
  totalWIP: number;
  totalAssets: number;
  totalLiabilities: number;
  totalLoans: number;
  totalEquity: number;
  apOutstanding: number;
  projectRows: ProjectRow[];
}

export default function FinancialSummaryClient() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      // Fetch all GL data, loans, and projects in parallel
      const [ledgerRes, loansRes, projectsRes] = await Promise.all([
        supabase.from("journal_entry_lines").select(`
          debit, credit, project_id,
          account:chart_of_accounts(account_number, name, type),
          journal_entry:journal_entries(id, entry_date, status)
        `),
        supabase.from("loans").select("project_id, current_balance, status").eq("status", "active"),
        supabase.from("projects").select("id, name").order("name"),
      ]);

      // Filter to posted entries
      const lines = (ledgerRes.data ?? []).filter((l: any) => l.journal_entry?.status === "posted");

      // Aggregate by account
      const acctTotals: Record<string, { debit: number; credit: number; type: string }> = {};
      for (const line of lines) {
        const acc = line.account as any;
        if (!acc) continue;
        const key = acc.account_number;
        if (!acctTotals[key]) acctTotals[key] = { debit: 0, credit: 0, type: acc.type ?? "" };
        acctTotals[key].debit += Number(line.debit ?? 0);
        acctTotals[key].credit += Number(line.credit ?? 0);
      }

      const getBalance = (acctNum: string) => {
        const a = acctTotals[acctNum];
        if (!a) return 0;
        if (a.type === "asset" || a.type === "expense" || a.type === "cogs") return a.debit - a.credit;
        return a.credit - a.debit;
      };

      const cash = getBalance("1000");
      const wip1210 = getBalance("1210");
      const wip1230 = getBalance("1230");
      const capInterest = getBalance("1220");
      const totalWIP = wip1210 + wip1230 + capInterest;

      // Construction Loans: sum all loan payable accounts (2100 fallback + 220x per-loan accounts)
      let totalLoans = 0;
      for (const [acctNum, a] of Object.entries(acctTotals)) {
        if (a.type === "liability" && acctNum >= "2100") {
          totalLoans += a.credit - a.debit;
        }
      }

      // AP Outstanding from GL account 2000 (consistent with balance sheet)
      const apOutstanding = getBalance("2000");

      // Calculate total assets and equity from all accounts
      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquityAccounts = 0;
      let retainedEarnings = 0;
      for (const [acctNum, a] of Object.entries(acctTotals)) {
        const balance = a.type === "asset" || a.type === "expense" || a.type === "cogs"
          ? a.debit - a.credit
          : a.credit - a.debit;
        if (a.type === "asset") totalAssets += balance;
        else if (a.type === "liability") totalLiabilities += balance;
        else if (a.type === "equity") totalEquityAccounts += balance;
        else if (a.type === "revenue") retainedEarnings += balance;
        else if (a.type === "expense" || a.type === "cogs") retainedEarnings -= balance;
      }
      const totalEquity = totalEquityAccounts + retainedEarnings;

      // WIP per project from GL (1210 + 1220 + 1230)
      const projectWIP: Record<string, number> = {};
      for (const line of lines) {
        const acc = line.account as any;
        if (!acc || !line.project_id) continue;
        const pid = line.project_id;
        const debit = Number(line.debit ?? 0);
        const credit = Number(line.credit ?? 0);

        if (acc.account_number === "1210" || acc.account_number === "1220" || acc.account_number === "1230") {
          projectWIP[pid] = (projectWIP[pid] ?? 0) + debit - credit;
        }
      }

      // Loan balance per project from loans table (loan JEs don't carry project_id)
      const projectLoans: Record<string, number> = {};
      for (const loan of loansRes.data ?? []) {
        if (loan.project_id) {
          projectLoans[loan.project_id] = (projectLoans[loan.project_id] ?? 0) + (loan.current_balance ?? 0);
        }
      }

      const projects = projectsRes.data ?? [];
      const projectRows: ProjectRow[] = projects
        .map(p => ({
          id: p.id,
          name: p.name,
          wip_balance: projectWIP[p.id] ?? 0,
          loan_balance: projectLoans[p.id] ?? 0,
        }))
        .filter(p => Math.abs(p.wip_balance) > 0.01 || Math.abs(p.loan_balance) > 0.01);

      setData({ cash, totalWIP, totalAssets, totalLiabilities, totalLoans, totalEquity, apOutstanding, projectRows });
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <p className="text-sm text-gray-500">Company-wide financial overview</p>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FileDown size={15} />
          Export PDF
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : !data ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard label="Cash on Hand" value={fmt(data.cash)} color="text-green-600" />
            <KpiCard label="Total WIP / CIP" value={fmt(data.totalWIP)} color="text-[#4272EF]" />
            <KpiCard label="Total Assets" value={fmt(data.totalAssets)} color="text-gray-800" />
            <KpiCard label="Construction Loans" value={fmt(data.totalLoans)} color="text-amber-600" />
            <KpiCard label="AP Outstanding" value={fmt(data.apOutstanding)} color="text-red-600" />
            <KpiCard label="Total Liabilities" value={fmt(data.totalLiabilities)} color="text-amber-600" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Total Equity</p>
              <p className={`text-xl font-semibold ${data.totalEquity >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(data.totalEquity)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <p className="text-xs text-gray-500 mb-1">Balance Check (A − L − E)</p>
              <p className={`text-xl font-semibold ${Math.abs(data.totalAssets - data.totalLiabilities - data.totalEquity) < 1 ? "text-green-600" : "text-amber-600"}`}>
                {Math.abs(data.totalAssets - data.totalLiabilities - data.totalEquity) < 1 ? "✓ Balanced" : fmt(data.totalAssets - data.totalLiabilities - data.totalEquity)}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: "#f8faff" }}>
              <h2 className="text-sm font-semibold text-[#4272EF]">WIP & Loan Balance by Project</h2>
            </div>
            {data.projectRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No project data found.</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Project</th>
                    <th className="px-5 py-3 text-right">WIP Balance</th>
                    <th className="px-5 py-3 text-right">Loan Balance</th>
                    <th className="px-5 py-3 text-right">Net Equity in Project</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projectRows.map(row => {
                    const netEquity = row.wip_balance - row.loan_balance;
                    return (
                      <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-800">{row.name}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{fmt(row.wip_balance)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{fmt(row.loan_balance)}</td>
                        <td className={`px-5 py-3 text-right font-medium ${netEquity >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(netEquity)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-sm">
                    <td className="px-5 py-3 text-gray-700">Total</td>
                    <td className="px-5 py-3 text-right text-gray-700">{fmt(data.projectRows.reduce((s, r) => s + r.wip_balance, 0))}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{fmt(data.projectRows.reduce((s, r) => s + r.loan_balance, 0))}</td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {fmt(data.projectRows.reduce((s, r) => s + (r.wip_balance - r.loan_balance), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
