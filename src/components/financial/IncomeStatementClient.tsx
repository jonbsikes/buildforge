"use client";

import { useEffect, useState, useCallback, ReactNode } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { X, ChevronDown } from "lucide-react";
import ReportChrome from "@/components/ui/ReportChrome";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type DatePreset = "this_month" | "this_quarter" | "this_year" | "all_time" | "custom";

interface DrillLine {
  date: string;
  description: string;
  reference: string | null;
  amount: number;
}

interface AccountLine {
  account_number: string;
  account: string;
  type: string;
  total: number;
  entries: DrillLine[]; // loaded on demand for drill-down
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
}

function getPresetRange(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.toISOString().split("T")[0];
  if (preset === "this_month") return { start: new Date(y, m, 1).toISOString().split("T")[0], end: today };
  if (preset === "this_quarter") return { start: new Date(y, Math.floor(m / 3) * 3, 1).toISOString().split("T")[0], end: today };
  if (preset === "all_time") return { start: "2020-01-01", end: today };
  return { start: `${y}-01-01`, end: today };
}

/** Fetch JE lines for a specific P&L account on demand (drill-down) */
async function fetchAccountEntries(accountNumber: string, accountType: string, start: string, end: string): Promise<DrillLine[]> {
  const supabase = createClient();
  type LineRow = {
    debit: number | null;
    credit: number | null;
    description: string | null;
    journal_entry: { entry_date: string; reference: string | null; description: string | null; status: string } | null;
  };
  let allLines: LineRow[] = [];
  let fromIdx = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: page } = await supabase
      .from("journal_entry_lines")
      .select(`
        debit, credit, description,
        journal_entry:journal_entries!inner(entry_date, reference, description, status),
        account:chart_of_accounts!inner(account_number)
      `)
      .eq("account.account_number", accountNumber)
      .eq("journal_entry.status", "posted")
      .gte("journal_entry.entry_date", start)
      .lte("journal_entry.entry_date", end)
      .order("id")
      .range(fromIdx, fromIdx + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    allLines = allLines.concat(page as unknown as LineRow[]);
    if (page.length < PAGE_SIZE) break;
    fromIdx += PAGE_SIZE;
  }
  return allLines
    .map((l) => ({
      date: l.journal_entry?.entry_date ?? "",
      reference: l.journal_entry?.reference ?? null,
      description: l.description ?? l.journal_entry?.description ?? "",
      amount: accountType === "revenue"
        ? Number(l.credit ?? 0) - Number(l.debit ?? 0)
        : Number(l.debit ?? 0) - Number(l.credit ?? 0),
    }))
    .filter((e) => Math.abs(e.amount) > 0.005)
    .sort((x, y) => y.date.localeCompare(x.date));
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

    // Server-side aggregation — per-account P&L totals for the range.
    // Drill-down lines are fetched on demand when an account is clicked.
    type RpcRow = {
      account_number: string;
      account_name: string;
      account_type: string;
      total_debit: number;
      total_credit: number;
    };
    const { data: rpcData } = await (supabase.rpc as any)("get_income_statement_data", { p_start: start, p_end: end });
    const rows = (rpcData ?? []) as RpcRow[];

    const toLines = (type: string): AccountLine[] =>
      rows
        .filter((a) => a.account_type === type)
        .map((a) => ({
          account_number: a.account_number,
          account: `${a.account_number} · ${a.account_name}`,
          type: a.account_type,
          total: type === "revenue"
            ? Number(a.total_credit) - Number(a.total_debit)
            : Number(a.total_debit) - Number(a.total_credit),
          entries: [],
        }))
        .filter((a) => Math.abs(a.total) > 0.01)
        .sort((a, b) => a.account_number.localeCompare(b.account_number));

    const revenue = toLines("revenue");
    const cogs = toLines("cogs");
    const expenses = toLines("expense");
    const totalRevenue = revenue.reduce((s, l) => s + l.total, 0);
    const totalCOGS = cogs.reduce((s, l) => s + l.total, 0);
    const totalExpenses = expenses.reduce((s, l) => s + l.total, 0);
    const grossProfit = totalRevenue - totalCOGS;

    setData({ revenue, cogs, expenses, totalRevenue, totalCOGS, grossProfit, totalExpenses, netIncome: grossProfit - totalExpenses });
    setLoading(false);
  }, [preset, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  const openDrill = useCallback(async (line: AccountLine) => {
    // Load JE lines on demand for drill-down
    const { start, end } = preset === "custom" ? { start: customStart, end: customEnd } : getPresetRange(preset);
    if (!start || !end) return;
    const entries = await fetchAccountEntries(line.account_number, line.type, start, end);
    setDrillEntry({ ...line, entries });
  }, [preset, customStart, customEnd]);

  return (
    <ReportChrome
      title="Income Statement"
      showDateRange={true}
      dateMode="range"
      onDateChange={(range) => {
        setPreset("custom");
        setCustomStart(range.start);
        setCustomEnd(range.end);
      }}
      loading={loading}
      exportSlug="income-statement"
    >
      {!data ? null : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-6 space-y-6">
            <ISSection title="Revenue" lines={data.revenue} total={data.totalRevenue} totalLabel="Total Revenue" onDrill={openDrill} colorClass="text-green-700" />
            <ISSection title="Cost of Goods Sold" lines={data.cogs} total={data.totalCOGS} totalLabel="Total COGS" onDrill={openDrill} colorClass="text-red-700" />
            <div className="flex justify-between items-center border-t border-gray-200 pt-3">
              <span className="font-semibold text-gray-800 text-sm">Gross Profit</span>
              <span className={`font-semibold text-sm ${data.grossProfit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(data.grossProfit)}</span>
            </div>
            <ISSection title="Operating Expenses" lines={data.expenses} total={data.totalExpenses} totalLabel="Total Operating Expenses" onDrill={openDrill} colorClass="text-orange-700" />
            <div className="border-t-2 border-[#4272EF]/20 pt-4">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900 text-base">Net Income</span>
                <span className={`font-bold text-base tabular-nums ${data.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(data.netIncome)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {drillEntry && <DrillPanel line={drillEntry} onClose={() => setDrillEntry(null)} />}
    </ReportChrome>
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
              {lines.map((line, idx) => (
                <tr
                  key={line.account}
                  className={`border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors group ${idx % 2 === 0 ? "bg-gray-50/50" : ""}`}
                  onClick={() => onDrill(line)}
                >
                  <td className="py-2 pl-4 text-gray-700 flex items-center gap-1">
                    {line.account}
                    <ChevronDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>
                  <td className="py-2 pr-2 text-right font-medium text-gray-800 tabular-nums">{fmt(line.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between items-center border-t-2 border-[#4272EF]/20 pt-2">
        <span className="text-sm font-semibold text-gray-700">{totalLabel}</span>
        <span className={`text-sm font-semibold tabular-nums ${colorClass}`}>{fmt(total)}</span>
      </div>
    </div>
  );
}

function DrillPanel({ line, onClose }: { line: AccountLine; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-5xl bg-white shadow-2xl flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-[#4272EF]">
          <div>
            <h3 className="font-semibold text-white">{line.account}</h3>
            <p className="text-xs text-blue-100 mt-0.5">{line.entries.length} entries · Total: {fmtFull(line.total)}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-auto flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">Ref</th>
                  <th className="px-5 py-3 text-left">Description</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {line.entries.map((e, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{e.date}</td>
                    <td className="px-5 py-2.5 text-gray-400 font-mono text-xs">{e.reference ?? "—"}</td>
                    <td className="px-5 py-2.5 text-gray-700">{e.description}</td>
                    <td className="px-5 py-2.5 text-right font-medium text-gray-800 tabular-nums">{fmtFull(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">Total</span>
          <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmtFull(line.total)}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
