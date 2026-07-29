"use client";

import { Wallet, HardHat, Building2, Landmark, Receipt, Scale, CheckCircle2, AlertCircle } from "lucide-react";
import ReportChrome from "@/components/ui/ReportChrome";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export interface ProjectRow {
  id: string;
  name: string;
  wip_balance: number;
  loan_balance: number;
}

export interface SummaryData {
  cash: number;
  totalWIP: number;
  totalAssets: number;
  totalLiabilities: number;
  totalLoans: number;
  totalEquity: number;
  apOutstanding: number;
  projectRows: ProjectRow[];
}

// Data is assembled server-side in financial/summary/page.tsx (Package 05 §B)
// — first paint carries the numbers; this component is purely presentational.
export default function FinancialSummaryClient({ data }: { data: SummaryData }) {
  const isBalanced = Math.abs(data.totalAssets - data.totalLiabilities - data.totalEquity) < 1;

  return (
    <ReportChrome title="Financial Summary" subtitle="Company-wide financial overview" exportSlug="financial-summary">
      {(
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
