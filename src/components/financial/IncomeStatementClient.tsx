// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown, X, ChevronDown, BookOpen } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type DatePreset = "this_month" | "this_quarter" | "this_year" | "custom";

interface DrillLine {
  date: string;
  description: string;
  reference: string | null;
  amount: number;
}

interface AccountLine {
  account_number: string;
  account: string;
  total: number;
  entries: DrillLine[];
}

interface StatementData {
  revenue: AccountLine[];
  cogs: AccountLine[];
  expenses: AccountLine[];
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  totalExpenses: number;
  netIncome: number;
  fromLedger: boolean;
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

    // Pull from journal_entry_lines as primary ledger source
    const { data: ledgerLines } = await supabase
      .from("journal_entry_lines")
      .select(`
        id, debit, credit, description,
        account:chart_of_accounts(account_number, name, type),
        journal_entry:journal_entries(entry_date, reference, description, status)
      `)
      .gte("journal_entries.entry_date", start)
      .lte("journal_entries.entry_date", end)
      .eq("journal_entries.status", "posted");

    const posted = (ledgerLines ?? []).filter((l: any) => l.journal_entry?.status === "posted");

    if (posted.length > 0) {
      // Group by account for revenue, cogs, expense
      const byAccount: Record<string, { account_number: string; name: string; type: string; debit: number; credit: number; entries: DrillLine[] }> = {};

      for (const line of posted) {
        const acc = line.account as { account_number: string; name: string; type: string };
        const je = line.journal_entry as { entry_date: string; reference: string | null; description: string };
        if (!acc || !["revenue", "cogs", "expense"].includes(acc.type)) continue;
        if (!byAccount[acc.account_number]) {
          byAccount[acc.account_number] = { account_number: acc.account_number, name: acc.name, type: acc.type, debit: 0, credit: 0, entries: [] };
        }
        byAccount[acc.account_number].debit += Number(line.debit);
        byAccount[acc.account_number].credit += Number(line.credit);
        byAccount[acc.account_number].entries.push({
          date: je.entry_date,
          reference: je.reference,
          description: line.description ?? je.description,
          amount: acc.type === "revenue" ? Number(line.credit) : Number(line.debit),
        });
      }

      const toLines = (type: string): AccountLine[] =>
        Object.values(byAccount)
          .filter((a) => a.type === type)
          .map((a) => ({
            account_number: a.account_number,
            account: `${a.account_number} · ${a.name}`,
            total: type === "revenue" ? a.credit : a.debit,
            entries: a.entries.filter((e) => e.amount > 0),
          }))
          .filter((a) => a.total !== 0)
          .sort((a, b) => a.account_number.localeCompare(b.account_number));

      const revenue = toLines("revenue");
      const cogs = toLines("cogs");
      const expenses = toLines("expense");
      const totalRevenue = revenue.reduce((s, l) => s + l.total, 0);
      const totalCOGS = cogs.reduce((s, l) => s + l.total, 0);
      const totalExpenses = expenses.reduce((s, l) => s + l.total, 0);
      const grossProfit = totalRevenue - totalCOGS;

      setData({ revenue, cogs, expenses, totalRevenue, totalCOGS, grossProfit, totalExpenses, netIncome: grossProfit - totalExpenses, fromLedger: true });
      setLoading(false);
      return;
    }

    // Fallback: pull from paid invoices + settled sales
    const [{ data: paidInvoices }, { data: salesData }] = await Promise.all([
      supabase.from("invoices").select("id, vendor, invoice_number, amount, payment_date, project_id").eq("status", "paid").gte("payment_date", start).lte("payment_date", end),
      supabase.from("sales").select("id, description, settled_amount, contract_price, settled_date, sale_type, is_settled").eq("is_settled", true).gte("settled_date", start).lte("settled_date", end),
    ]);

    const cogsLines: AccountLine[] = paidInvoices && paidInvoices.length > 0 ? [{
      account_number: "5000",
      account: "Construction Costs (from AP)",
      total: paidInvoices.reduce((s: number, i: any) => s + (i.amount ?? 0), 0),
      entries: paidInvoices.map((i: any) => ({ date: i.payment_date ?? "", reference: i.invoice_number, description: i.vendor ?? "Unknown", amount: i.amount ?? 0 })),
    }] : [];

    const revLines: AccountLine[] = salesData && salesData.length > 0 ? [{
      account_number: "4000",
      account: "Home / Lot Sales (from Sales records)",
      total: salesData.reduce((s: number, s2: any) => s + (s2.settled_amount ?? s2.contract_price ?? 0), 0),
      entries: salesData.map((s: any) => ({ date: s.settled_date ?? "", reference: null, description: s.description, amount: s.settled_amount ?? s.contract_price ?? 0 })),
    }] : [];

    const totalRevenue = revLines.reduce((s, l) => s + l.total, 0);
    const totalCOGS = cogsLines.reduce((s, l) => s + l.total, 0);
    const grossProfit = totalRevenue - totalCOGS;
    setData({ revenue: revLines, cogs: cogsLines, expenses: [], totalRevenue, totalCOGS, grossProfit, totalExpenses: 0, netIncome: grossProfit, fromLedger: false });
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
          <>
            {!data.fromLedger && (
              <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                <BookOpen size={15} />
                No posted journal entries found for this period. Showing estimates from AP invoices and sales records. Post journal entries to see full financial statements.
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 text-center" style={{ backgroundColor: "#4272EF" }}>
                <h2 className="text-base font-bold text-white">Income Statement</h2>
                <p className="text-xs text-blue-100 mt-0.5">{rangeLabel}</p>
              </div>
              <div className="p-6 space-y-6">
                <ISSection title="Revenue" lines={data.revenue} total={data.totalRevenue} totalLabel="Total Revenue" onDrill={setDrillEntry} colorClass="text-green-700" />
                <ISSection title="Cost of Goods Sold" lines={data.cogs} total={data.totalCOGS} totalLabel="Total COGS" onDrill={setDrillEntry} colorClass="text-red-700" />
                <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                  <span className="font-semibold text-gray-800 text-sm">Gross Profit</span>
                  <span className={`font-semibold text-sm ${data.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(data.grossProfit)}</span>
                </div>
                <ISSection title="Operating Expenses" lines={data.expenses} total={data.totalExpenses} totalLabel="Total Operating Expenses" onDrill={setDrillEntry} colorClass="text-orange-700" />
                <div className="border-t-2 border-gray-300 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-gray-900 text-base">Net Income</span>
                    <span className={`font-bold text-base ${data.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(data.netIncome)}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {drillEntry && <DrillModal line={drillEntry} onClose={() => setDrillEntry(null)} />}
    </>
  );
}

function ISSection({ title, lines, total, totalLabel, onDrill, colorClass }: {
  title: string; lines: AccountLine[]; total: number; totalLabel: string;
  onDrill: (l: AccountLine) => void; colorClass: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4272EF] mb-2">{title}</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-gray-400 py-2 pl-2">No entries for this period.</p>
      ) : (
        <div className="overflow-x-auto">
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
        </div>
      )}
      <div className="flex justify-between items-center border-t border-gray-200 pt-2">
        <span className="text-sm font-semibold text-gray-700">{totalLabel}</span>
        <span className={`text-sm font-semibold ${colorClass}`}>{fmt(total)}</span>
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