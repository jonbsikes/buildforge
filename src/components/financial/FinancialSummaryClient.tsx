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
  total_budget: number;
  actual_spend: number;
  variance: number;
}

interface SummaryData {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  apOutstanding: number;
  drawsFunded: number;
  projectRows: ProjectRow[];
}

export default function FinancialSummaryClient() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [projectsRes, invoicesRes, drawsRes] = await Promise.all([
        supabase.from("projects").select("id, name, total_budget").order("name"),
        supabase.from("invoices").select("amount, status, project_id"),
        supabase.from("loan_draws").select("total_amount, status"),
      ]);

      const projects = projectsRes.data ?? [];
      const invoices = invoicesRes.data ?? [];
      const draws = drawsRes.data ?? [];

      const salesRes = await supabase
        .from("sales")
        .select("settled_amount, contract_price, is_settled");
      const sales = salesRes.data ?? [];

      const glRes = await supabase
        .from("gl_entries")
        .select("amount, credit_account");
      const glEntries = glRes.data ?? [];

      const totalRevenue = sales.some(s => s.is_settled)
        ? sales.reduce((sum, s) => {
            if (s.is_settled) return sum + (s.settled_amount ?? s.contract_price ?? 0);
            return sum;
          }, 0)
        : glEntries
            .filter(e => /revenue/i.test(e.credit_account))
            .reduce((sum, e) => sum + e.amount, 0);

      const totalExpenses = invoices
        .filter(i => i.status === "paid")
        .reduce((sum, i) => sum + (i.amount ?? 0), 0);

      const apOutstanding = invoices
        .filter(i => !["paid", "disputed"].includes(i.status))
        .reduce((sum, i) => sum + (i.amount ?? 0), 0);

      const drawsFunded = draws
        .filter(d => d.status === "funded")
        .reduce((sum, d) => sum + d.total_amount, 0);

      const spendByProject: Record<string, number> = {};
      invoices
        .filter(i => i.status === "paid" && i.project_id)
        .forEach(i => {
          spendByProject[i.project_id!] = (spendByProject[i.project_id!] ?? 0) + (i.amount ?? 0);
        });

      const projectRows: ProjectRow[] = projects.map(p => {
        const actual = spendByProject[p.id] ?? 0;
        return {
          id: p.id,
          name: p.name,
          total_budget: p.total_budget,
          actual_spend: actual,
          variance: p.total_budget - actual,
        };
      });

      setData({ totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses, apOutstanding, drawsFunded, projectRows });
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
            <KpiCard label="Total Revenue" value={fmt(data.totalRevenue)} color="text-green-600" />
            <KpiCard label="Total Expenses" value={fmt(data.totalExpenses)} color="text-red-600" />
            <KpiCard label="Net Income" value={fmt(data.netIncome)} color={data.netIncome >= 0 ? "text-green-600" : "text-red-600"} />
            <KpiCard label="AP Outstanding" value={fmt(data.apOutstanding)} color="text-amber-600" />
            <KpiCard label="Total Draws Funded" value={fmt(data.drawsFunded)} color="text-[#4272EF]" />
            <KpiCard label="Cash on Hand" value="See Bank Accounts" color="text-gray-400" note />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: "#f8faff" }}>
              <h2 className="text-sm font-semibold text-[#4272EF]">Budget vs. Actual by Project</h2>
            </div>
            {data.projectRows.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No projects found.</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Project</th>
                    <th className="px-5 py-3 text-right">Budget</th>
                    <th className="px-5 py-3 text-right">Actual Spend</th>
                    <th className="px-5 py-3 text-right">Variance</th>
                    <th className="px-5 py-3 text-right">% Used</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projectRows.map(row => {
                    const pct = row.total_budget > 0 ? Math.round((row.actual_spend / row.total_budget) * 100) : 0;
                    const over = row.variance < 0;
                    return (
                      <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-800">{row.name}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{fmt(row.total_budget)}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{fmt(row.actual_spend)}</td>
                        <td className={`px-5 py-3 text-right font-medium ${over ? "text-red-600" : "text-green-600"}`}>
                          {over ? "-" : "+"}{fmt(Math.abs(row.variance))}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${pct > 100 ? "bg-red-100 text-red-700" : pct > 80 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-sm">
                    <td className="px-5 py-3 text-gray-700">Total</td>
                    <td className="px-5 py-3 text-right text-gray-700">{fmt(data.projectRows.reduce((s, r) => s + r.total_budget, 0))}</td>
                    <td className="px-5 py-3 text-right text-gray-700">{fmt(data.projectRows.reduce((s, r) => s + r.actual_spend, 0))}</td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {(() => { const v = data.projectRows.reduce((s, r) => s + r.variance, 0); return `${v < 0 ? "-" : "+"}${fmt(Math.abs(v))}`; })()}
                    </td>
                    <td />
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

function KpiCard({ label, value, color, note }: { label: string; value: string; color: string; note?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`${note ? "text-base mt-1" :