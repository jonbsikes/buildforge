"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { FileDown, X, ChevronDown } from "lucide-react";
import ReportExportButtons from "@/components/ui/ReportExportButtons";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

type DatePreset = "this_month" | "this_quarter" | "this_year" | "since_inception" | "custom";

interface DrillEntry {
  id: string;
  entry_date: string;
  description: string;
  amount: number;
}

interface CashFlowLine {
  label: string;
  amount: number;
  entries: DrillEntry[];
  isSubtraction?: boolean;
}

interface CashFlowSection {
  title: string;
  lines: CashFlowLine[];
  total: number;
}

function getPresetRange(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.toISOString().split("T")[0];
  if (preset === "this_month") return { start: new Date(y, m, 1).toISOString().split("T")[0], end: today };
  if (preset === "this_quarter") return { start: new Date(y, Math.floor(m / 3) * 3, 1).toISOString().split("T")[0], end: today };
  if (preset === "since_inception") return { start: "2000-01-01", end: today };
  return { start: `${y}-01-01`, end: today };
}

export default function CashFlowClient() {
  const [preset, setPreset] = useState<DatePreset>("since_inception");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sections, setSections] = useState<CashFlowSection[]>([]);
  const [netChange, setNetChange] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<CashFlowLine | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = preset === "custom" ? { start: customStart, end: customEnd } : getPresetRange(preset);
    if (!start || !end) { setLoading(false); return; }

    const supabase = createClient();

    // Narrow the PostgREST nested-join shape. Aliased joins aren't inferred.
    type LedgerRow = {
      id: string;
      debit: number | null;
      credit: number | null;
      description: string | null;
      account: {
        account_number: string;
        name: string;
        type: string | null;
      } | null;
      journal_entry: {
        id: string;
        entry_date: string;
        status: string;
        description: string | null;
        source_type: string | null;
      } | null;
    };

    // Fetch ALL journal entry lines (paginate past Supabase 1000-row default)
    const selectQuery = `
        id, debit, credit, description,
        account:chart_of_accounts(account_number, name, type),
        journal_entry:journal_entries(id, entry_date, status, description, source_type)
    `;
    let rawLines: LedgerRow[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: page } = await supabase
        .from("journal_entry_lines")
        .select(selectQuery)
        .range(from, from + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      rawLines = rawLines.concat(page as unknown as LedgerRow[]);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Filter to posted entries within date range
    const lines = rawLines.filter((l) =>
      l.journal_entry?.status === "posted" &&
      (l.journal_entry?.entry_date ?? "") >= start &&
      (l.journal_entry?.entry_date ?? "") <= end
    );

    // Helper to build drill entries from lines
    const toDrillEntries = (filtered: LedgerRow[]): DrillEntry[] =>
      filtered.map(l => ({
        id: l.id,
        entry_date: l.journal_entry?.entry_date ?? "",
        description: l.description || l.journal_entry?.description || "",
        amount: Number(l.debit || 0) - Number(l.credit || 0),
      })).sort((a, b) => b.entry_date.localeCompare(a.entry_date));

    // ─── BALANCE-SHEET-DRIVEN APPROACH ───────────────────────────────
    // Aggregate every account's net change over the period and derive the
    // cash flow statement directly from those movements. By construction:
    //
    //   Δ Cash = Net Income − Δ(non-cash assets) + Δ(liabilities) + Δ(equity)
    //
    // so this presentation always reconciles to the balance sheet and to the
    // actual cash account movement for the period — no imputation, no
    // double-counting, no edge cases around mixed JEs or migration entries.
    // ─────────────────────────────────────────────────────────────────

    const CASH_ACCOUNTS = new Set(["1000", "1010", "1020"]);

    const isLoanPayable = (a: string) => /^22\d{2}$/.test(a) || a === "2100";
    const isEquity = (a: string) => a.startsWith("3") && a !== "3100"; // 3100 = Retained Earnings (net income flows through it)
    const isFixedAsset = (a: string) => a.startsWith("14") || a.startsWith("15");

    // Aggregate per-account totals and keep the lines for drill-down.
    const acctTotals = new Map<string, { name: string; type: string; debits: number; credits: number; lines: LedgerRow[] }>();
    for (const l of lines) {
      const acct = l.account?.account_number ?? "";
      if (!acct) continue;
      const existing = acctTotals.get(acct) ?? {
        name: l.account?.name ?? acct,
        type: l.account?.type ?? "",
        debits: 0,
        credits: 0,
        lines: [],
      };
      existing.debits += Number(l.debit || 0);
      existing.credits += Number(l.credit || 0);
      existing.lines.push(l);
      acctTotals.set(acct, existing);
    }

    // Net Income = revenue − (expense + cogs).
    let netIncome = 0;
    const incomeStmtLines: LedgerRow[] = [];
    for (const [, a] of acctTotals) {
      if (a.type === "revenue") netIncome += a.credits - a.debits;
      else if (a.type === "expense" || a.type === "cogs") netIncome -= a.debits - a.credits;
      if (a.type === "revenue" || a.type === "expense" || a.type === "cogs") {
        incomeStmtLines.push(...a.lines);
      }
    }

    type SectionLine = { label: string; amount: number; entries: DrillEntry[]; isSubtraction?: boolean };
    const opSectionLines: SectionLine[] = [];
    const invSectionLines: SectionLine[] = [];
    const finSectionLines: SectionLine[] = [];

    let opTotal = netIncome;
    let invTotal = 0;
    let finTotal = 0;

    // Net Income/Loss line (operating).
    if (incomeStmtLines.length > 0 && netIncome !== 0) {
      opSectionLines.push({
        label: netIncome >= 0 ? "Net Income" : "Net Loss",
        amount: Math.abs(netIncome),
        entries: toDrillEntries(incomeStmtLines),
        isSubtraction: netIncome < 0,
      });
    }

    // Group all loan accounts into a single "Construction loans" line and show
    // capital contributions / distributions gross from equity activity.
    const loanLines: LedgerRow[] = [];
    let loanDelta = 0;
    const equityCreditLines: LedgerRow[] = [];
    const equityDebitLines: LedgerRow[] = [];
    let equityCredits = 0;
    let equityDebits = 0;

    const sortedAccts = Array.from(acctTotals.entries()).sort(([a], [b]) => a.localeCompare(b));

    for (const [acct, a] of sortedAccts) {
      if (CASH_ACCOUNTS.has(acct)) continue; // result, not a source
      if (acct === "1120" || acct === "2060") continue; // transitory cash holding accounts
      if (a.type === "revenue" || a.type === "expense" || a.type === "cogs") continue; // in net income
      if (acct === "3100") continue; // retained earnings flows through net income

      const isDebitNatured = a.type === "asset";
      const balanceDelta = isDebitNatured ? a.debits - a.credits : a.credits - a.debits;
      if (balanceDelta === 0 && a.debits === 0 && a.credits === 0) continue;

      // Loans → grouped into one financing line at the bottom.
      if (isLoanPayable(acct)) {
        loanDelta += balanceDelta;
        loanLines.push(...a.lines);
        continue;
      }

      // Equity → split into gross contributions (credits) and distributions (debits).
      if (isEquity(acct)) {
        if (a.credits > 0) {
          equityCredits += a.credits;
          equityCreditLines.push(...a.lines.filter((l) => Number(l.credit || 0) > 0));
        }
        if (a.debits > 0) {
          equityDebits += a.debits;
          equityDebitLines.push(...a.lines.filter((l) => Number(l.debit || 0) > 0));
        }
        continue;
      }

      // Per-account operating / investing line.
      if (balanceDelta === 0) continue;
      const cashEffect = isDebitNatured ? -balanceDelta : balanceDelta;
      const verb = balanceDelta > 0 ? "Increase" : "Decrease";
      const sectionLine: SectionLine = {
        label: `${verb} in ${a.name}`,
        amount: Math.abs(cashEffect),
        entries: toDrillEntries(a.lines),
        isSubtraction: cashEffect < 0,
      };

      if (isFixedAsset(acct)) {
        invSectionLines.push(sectionLine);
        invTotal += cashEffect;
      } else {
        opSectionLines.push(sectionLine);
        opTotal += cashEffect;
      }
    }

    // Financing — loans grouped, equity gross.
    if (loanDelta !== 0) {
      finSectionLines.push({
        label: loanDelta >= 0 ? "Construction loan draws (net)" : "Net loan principal payments",
        amount: Math.abs(loanDelta),
        entries: toDrillEntries(loanLines),
        isSubtraction: loanDelta < 0,
      });
      finTotal += loanDelta;
    }
    if (equityCredits > 0) {
      finSectionLines.push({
        label: "Capital contributions from owners",
        amount: equityCredits,
        entries: toDrillEntries(equityCreditLines),
      });
      finTotal += equityCredits;
    }
    if (equityDebits > 0) {
      finSectionLines.push({
        label: "Owner draws & distributions",
        amount: equityDebits,
        entries: toDrillEntries(equityDebitLines),
        isSubtraction: true,
      });
      finTotal -= equityDebits;
    }

    const operating: CashFlowSection = {
      title: "Operating Activities",
      lines: opSectionLines,
      total: opTotal,
    };

    const investing: CashFlowSection = {
      title: "Investing Activities",
      lines: invSectionLines,
      total: invTotal,
    };

    const financing: CashFlowSection = {
      title: "Financing Activities",
      lines: finSectionLines,
      total: finTotal,
    };

    setSections([operating, investing, financing]);
    setNetChange(operating.total + investing.total + financing.total);
    setLoading(false);
  }, [preset, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  const rangeLabel = preset === "custom"
    ? `${customStart} – ${customEnd}`
    : preset.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <>
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-end mb-4 print:hidden">
          <ReportExportButtons slug="cash-flow" params={{ start: preset === "custom" ? customStart : undefined, end: preset === "custom" ? customEnd : undefined }} />
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
          <div className="flex items-center gap-2">
            {(["this_month", "this_quarter", "this_year", "since_inception", "custom"] as DatePreset[]).map(p => (
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
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 text-center" style={{ backgroundColor: "#4272EF" }}>
              <h2 className="text-base font-bold text-white">Cash Flow Statement</h2>
              <p className="text-xs text-blue-100 mt-0.5">{rangeLabel}</p>
            </div>
            <div className="p-6 space-y-6">
              {sections.map(section => (
                <CFSection key={section.title} section={section} onDrill={setDrill} />
              ))}
              <div className="border-t-2 border-gray-300 pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900 text-base">Net Change in Cash</span>
                  <span className={`font-bold text-base ${netChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {netChange < 0 ? `(${fmt(Math.abs(netChange))})` : fmt(netChange)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {drill && <CFDrillModal line={drill} onClose={() => setDrill(null)} />}
    </>
  );
}

function CFSection({ section, onDrill }: { section: CashFlowSection; onDrill: (l: CashFlowLine) => void }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4272EF] mb-2">{section.title}</h3>
      <div className="overflow-x-auto">
      <table className="w-full text-sm mb-2">
        <tbody>
          {section.lines.map(line => (
            <tr key={line.label} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors group" onClick={() => onDrill(line)}>
              <td className="py-2 pl-4 text-gray-700">
                <span className="flex items-center gap-1">
                  {line.isSubtraction && <span className="text-gray-400">−</span>}
                  {line.label}
                  <ChevronDown size={12} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </td>
              <td className={`py-2 pr-2 text-right font-medium ${line.isSubtraction ? "text-red-600" : "text-gray-800"}`}>
                {line.isSubtraction ? `(${fmt(line.amount)})` : fmt(line.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="flex justify-between items-center border-t border-gray-200 pt-2">
        <span className="text-sm font-semibold text-gray-700">Net Cash from {section.title}</span>
        <span className={`text-sm font-semibold ${section.total >= 0 ? "text-green-700" : "text-red-700"}`}>
          {section.total < 0 ? `(${fmt(Math.abs(section.total))})` : fmt(section.total)}
        </span>
      </div>
    </div>
  );
}

function CFDrillModal({ line, onClose }: { line: CashFlowLine; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
          <div>
            <h3 className="font-semibold text-white">{line.label}</h3>
            <p className="text-xs text-blue-100 mt-0.5">{line.entries.length} entries · Total: {fmtFull(line.amount)}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1">
          {line.entries.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No entries for this period.</div>
          ) : (
            <div className="overflow-x-auto">
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
          )}
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">Total</span>
          <span className="text-sm font-semibold text-gray-900">{fmtFull(line.amount)}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
