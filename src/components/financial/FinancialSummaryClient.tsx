// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wallet, HardHat, Building2, Landmark, Receipt, Scale, CheckCircle2, AlertCircle } from "lucide-react";
import ReportChrome from "@/components/ui/ReportChrome";

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

      // Fetch loans and projects in parallel; paginate GL lines separately
      // to break past Supabase's 1000-row default cap.
      const [loansRes, projectsRes] = await Promise.all([
        supabase.from("loans").select("project_id, current_balance, status").eq("status", "active"),
        supabase.from("projects").select("id, name").order("name"),
      ]);

      const ledgerSelect = `
        debit, credit, project_id,
        account:chart_of_accounts(account_number, name, type),
        journal_entry:journal_entries(id, entry_date, status)
      `;
      let rawLines: any[] = [];
      let fromIdx = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        const { data: page } = await supabase
          .from("journal_entry_lines")
          .select(ledgerSelect)
          .range(fromIdx, fromIdx + PAGE_SIZE - 1);
        if (!page || page.length === 0) break;
        rawLines = rawLines.concat(page);
        if (page.length < PAGE_SIZE) break;
        fromIdx += PAGE_SIZE;
      }

      // Filter to posted entries
      const lines = rawLines.filter((l: any) => l.journal_entry?.status === "posted");

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

  const isBalanced = data && Math.abs(data.totalAssets - data.totalLiabilities - data.totalEquity) < 1;

  return (
    <ReportChrome title="Financial Summary" subtitle="Company-wide financial overview" exportSlug="financial-summary">
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : !data ? null : (
        <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              icon={Wallet}
              label="Cash on Hand"
              value={fmt(data.cash)}
              borderColor="border-green-500"
              secondaryText="Available in DDA"
            />
            <KpiCard
              icon={HardHat}
              label="Total WIP / CIP"
              value={fmt(data.totalWIP)}
              borderColor="border-[#4272EF]"
              secondaryText="Active projects"
            />
            <KpiCard
              icon={Building2}
              label="Total Assets"
              value={fmt(data.totalAssets)}
              borderColor="border-blue-500"
              secondaryText="All assets"
            />
            <KpiCard
              icon={Landmark}
              label="Construction Loans"
              value={fmt(data.totalLoans)}
              borderColor="border-amber-500"
              secondaryText="Outstanding"
            />
            <KpiCard
              icon={Receipt}
              label="AP Outstanding"
              value={fmt(data.apOutstanding)}
              borderColor="border-red-500"
              secondaryText="Unpaid invoices"
            />
            <KpiCard
              icon={Scale}
              label="Total Equity"
              value={fmt(data.totalEquity)}
              borderColor={data.totalEquity >= 0 ? "border-green-500" : "border-red-500"}
              secondaryText="Shareholders' equity"
            />
          </div>

          {/* Balance Check Indicator */}
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${isBalanced ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
            {isBalanced ? (
              <>
                <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
                <span className="text-sm font-medium text-green-700">Balance verified: Assets = Liabilities + Equity</span>
              </>
            ) : (
              <>
                <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
                <span className="text-sm font-medium text-amber-700">
                  Out of balance by {fmt(data.totalAssets - data.totalLiabilities - data.totalEquity)}
                </span>
              </>
            )}
          </div>

          {/* Project WIP & Loan Table */}
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
                      <th className="px-5 py-2 text-left">Project</th>
                      <th className="px-5 py-2 text-right">WIP Balance</th>
                      <th className="px-5 py-2 text-right">Loan Balance</th>
                      <th className="px-5 py-2 text-right">Net Equity in Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projectRows.map((row, idx) => {
                      const netEquity = row.wip_balance - row.loan_balance;
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-gray-50 transition-colors ${
                            idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                          } hover:bg-gray-50`}
                        >
                          <td className="px-5 py-2 font-medium text-gray-800">{row.name}</td>
                          <td className="px-5 py-2 text-right text-gray-600 font-variant-numeric tabular-nums">{fmt(row.wip_balance)}</td>
                          <td className="px-5 py-2 text-right text-gray-600 font-variant-numeric tabular-nums">{fmt(row.loan_balance)}</td>
                          <td className={`px-5 py-2 text-right font-medium tabular-nums ${netEquity >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {fmt(netEquity)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-sm">
                      <td className="px-5 py-2 text-gray-700">Total</td>
                      <td className="px-5 py-2 text-right text-gray-700 tabular-nums">{fmt(data.projectRows.reduce((s, r) => s + r.wip_balance, 0))}</td>
                      <td className="px-5 py-2 text-right text-gray-700 tabular-nums">{fmt(data.projectRows.reduce((s, r) => s + r.loan_balance, 0))}</td>
                      <td className="px-5 py-2 text-right text-gray-700 tabular-nums">
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
    </ReportChrome>
  );
}

function KpiCard({ label, value, borderColor, secondaryText, icon: Icon }: {
  label: string;
  value: string;
  borderColor: string;
  secondaryText?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${borderColor} border border-gray-200 px-5 py-4 flex items-start gap-3`}>
      <div className="mt-0.5 text-gray-400"><Icon size={20} /></div>
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-xl font-semibold tabular-nums text-gray-900">{value}</p>
        {secondaryText && <p className="text-[10px] text-gray-400 mt-0.5">{secondaryText}</p>}
      </div>
    </div>
  );
}
