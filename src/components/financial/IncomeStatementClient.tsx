"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown, X, ChevronDown } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type DatePreset = "this_month" | "this_quarter" | "this_year" | "custom";

interface GLEntry {
  id: string;
  entry_date: string;
  description: string;
  amount: number;
  debit_account: string;
  credit_account: string;
  source_type: string;
  project_id: string | null;
}

interface AccountLine {
  account: string;
  total: number;
  entries: GLEntry[];
}

interface StatementData {
  revenue: AccountLine[];
  expenses: AccountLine[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

function getPresetRange(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.toISOString().split("T")[0];
  if (preset === "this_month") return { start: new Date(y, m, 1).toISOString().split("T")[0], end: today };
  if (preset === "this_quarter") return { start: new Date(y, Math.floor(m / 3) * 3, 1).toISOString().split("T")[0], end: today };
  return { start: `${y}-01-01`, end: today };
}

export default function IncomeStatementClient() {
  const [preset, setPreset] = useState<DatePreset>("this_year");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillEntry, setDrillEntry] = useState<AccountLine | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = preset === "custom" ? { start: customStart, end: customEnd } : getPresetRange(preset);
    if (!start || !end) { setLoading(false); return; }

    const supabase = createClient();
    const { data: entries } = await supabase
      .from("gl_entries")
      .select("id, entry_date, description, amount, debit_account, credit_account, source_type, project_id")
      .gte("entry_date", start)
      .lte("entry_date", end)
      .order("entry_date");

    const glEntries: GLEntry[] = entries ?? [];

    const revenueEntries = glEntries.filter(e =>
      /revenue|income|sale/i.test(e.credit_account) ||
      /sale_settlement|home_sale|lot_sale|revenue/i.test(e.source_type)
    );
    const expenseEntries = glEntries.filter(e =>
      /expense|cost|labor|material|subcontract|overhead|construction|utilities|insurance|fee|permit/i.test(e.debit_account) ||
      /invoice_payment|expense/i.test(e.source_type)
    );

    const { data: paidInvoices } = await supabase
      .from("invoices")
      .select("id, vendor, invoice_number, amount, payment_date, project_id")
      .eq("status", "paid")
      .gte("payment_date", start)
      .lte("payment_date", end);
    const paidList = paidInvoices ?? [];

    let expenseLines: AccountLine[];
    if (expenseEntries.length > 0) {
      const byAccount: Record<string, GLEntry[]> = {};
      expenseEntries.forEach(e => {
        if (!byAccount[e.debit_account]) byAccount[e.debit_account] = [];
        byAccount[e.debit_account].push(e);
      });
      expenseLines = Object.entries(byAccount).map(([account, es]) => ({
        account, total: es.reduce((s, e) => s + e.amount, 0), entries: es,
      })).sort((a, b) => b.total - a.total);
    } else if (paidList.length > 0) {
      const byVendor: Record<string, { total: number; entries: GLEntry[] }> = {};
      paidList.forEach(inv => {
        const key = inv.vendor ?? "Unknown Vendor";
        if (!byVendor[key]) byVendor[key] = { total: 0, entries: [] };
        byVendor[key].total += inv.amount ?? 0;
        byVendor[key].entries.push({
          id: inv.id, entry_date: inv.payment_date ?? "",
          description: `Invoice ${inv.invoice_number ?? ""}`, amount: inv.amount ?? 0,
          debit_account: "Construction Costs", credit_account: "Cash",
          source_type: "invoice_payment", project_id: inv.project_id,
        });
      });
      expenseLines = Object.entries(byVendor).map(([account, v]) => ({
        account, total: v.total, entries: v.entries,
      })).sort((a, b) => b.total - a.total);
    } else {
      expenseLines = [];
    }

    let revenueLines: AccountLine[];
    if (revenueEntries.length > 0) {
      const byAccount: Record<string, GLEntry[]> = {};
      revenueEntries.forEach(e => {
        if (!byAccount[e.credit_account]) byAccount[e.credit_account] = [];
        byAccount[e.credit_account].push(e);
      });
      revenueLines = Object.entries(byAccount).map(([account, es]) => ({
        account, total: es.reduce((s, e) => s + e.amount, 0), entries: es,
      })).sort((a, b) => b.total - a.total);
    } else {
      const { data: salesData } = await supabase
        .from("sales")
        .select("id, description, settled_amount, contract_price, settled_date, sale_type, is_settled, project_id")
        .eq("is_settled", true)
        .gte("settled_date", start)
        .lte("settled_date", end);
      const salesList = salesData ?? [];
      if (salesList.length > 0) {
        const bySaleType: Record<string, GLEntry[]> = {};
        salesList.forEach(s => {
          const key = s.sale_type ?? "Sale";
          if (!bySaleType[key]) bySaleType[key] = [];
          bySaleType[key].push({
            id: s.id, entry_date: s.settled_date ?? "", description: s.description,
            amount: s.settled_amount ?? s.contract_price ?? 0,
            debit_account: "Cash", credit_account: "Revenue",
            source_type: "sale_settlement", project_id: s.project_id,
          });
        });
        revenueLines = Object.entries(bySaleType).map(([account, es]) => ({
          account: account.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + " Revenue",
          total: es.reduce((s, e) => s + e.amount, 0), entries: es,
        })).sort((a, b) => b.total - a.total);
      } else {
        revenueLines = [];
      }
    }

    const totalRevenue = revenueLines.reduce((s, l) => s + l.total, 0);
    const totalExpenses = expenseLines.reduce((s, l) => s + l.total, 0);
    setData({ revenue: revenueLines, expenses: expenseLines, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses });
    setLoading(false);
  }, [preset, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  const rangeLabel = preset === "custom"
    ? `${customStart} – ${customEnd}`
    : preset.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <>
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
          <div className="flex items-center gap-2">
            {(["this_month", "this_quarter", "this_year", "custom"] as DatePreset[]).map(p => (
              <button key={p} onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${preset === p ? "bg-[#4272EF] text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {p.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs" />
            </div>
          )}
          <div className="ml-auto">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <FileDown size={15} /> Export PDF
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : !data ? null : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 text-center" style={{ backgroundColor: "#4272EF" }}>
              <h2 className="text-base font-bold text-white">Income Statement</h2>
              <p className="text-xs text-blue-100 mt-0.5">{rangeLabel}</p>
            </div>
            <div className="p-6 space-y-6">
              <ISSection title="Revenue" lines={data.revenue} total={data.totalRevenue} totalLabel="Total Revenue" onDrill={setDrillEntry} positive />
              <ISSection title="Expenses" lines={data.expenses} total={data.totalExpenses} totalLabel="Total Expenses" onDrill={setDrillEntry} positive={false} />
              <div className="border-t-2 border-gray-300 pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900 text-base">Net Income</span>
                  <span className={`font-bold text-base ${data.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(data.netIncome)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {drillEntry && <DrillModal line={drillEntry} onClose={() => setDrillEntry(null)} />}
    </>
  );
}

function ISSection({ title, lines, total, totalLabel, onDrill, positive }: {
  title: string; lines: AccountLine[]; total: number; totalLabel: string;
  onDrill: (l: AccountLine) => void; positive: boolean;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4272EF] mb-2">{title}</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-gray-400 py-2 pl-2">No entries for this period.</p>
      ) : (
        <table className="w-full text-sm mb-2">
          <tbody>
            {lines.map(line => (
              <tr key={line.account} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors group" onClick={() => onDrill(line)}>
                <td className="py-2 pl-4 text-gray-700 flex items-center gap-1">
                  {line.account}
                  <ChevronDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </td>
                <td className="py-2 pr-2 text-right font-medium text-gray-800">{fmt(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex justify-between items-center border-t border-gray-200 pt-2">
        <span className="text-sm font-semibold text-gray-700">{totalLabel}</span>
        <span className={`text-sm font-semibold ${positive ? "text-green-700" : "text-red-700"}`}>{fmt(total)}</span>
      </div>
    </div>
  );
}

function DrillModal({ line, onClose }: { line: AccountLine; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
          <div>
            <h3 className="font-semibold text-white">{line.account}</h3>
            <p className="text-xs text-blue-100 mt-0.5">{line.entries.length} entries · Total: {fmtFull(line.total)}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr className="text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left">Date</th>
                <th className="px-5 py-3 text-left">Description</th>
                <th className="px-5 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {line.entries.map(e => (
                <tr key={e.id} className="border-b border-gray-50">
                  <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{e.entry_date}</td>
                  <td className="px-5 py-2.5 text-gray-700">{e.description}</td>
                  <td className="px-5 py-2.5 text-right font-medium text-gray-800">{fmtFull(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">Total</span>
          <span className="text-sm font-semibold text-gray-900">{fmtFull(line.total)}</span>
        </div>
      </div>
    </div>
  );
}
