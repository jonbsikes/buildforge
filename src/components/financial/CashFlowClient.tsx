// @ts-nocheck
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

    // Fetch ALL journal entry lines (paginate past Supabase 1000-row default)
    const selectQuery = `
        id, debit, credit, description,
        account:chart_of_accounts(account_number, name, type),
        journal_entry:journal_entries(id, entry_date, status, description, source_type)
    `;
    let rawLines: any[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: page } = await supabase
        .from("journal_entry_lines")
        .select(selectQuery)
        .range(from, from + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      rawLines = rawLines.concat(page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Filter to posted entries within date range
    const lines = rawLines.filter((l: any) =>
      l.journal_entry?.status === "posted" &&
      l.journal_entry?.entry_date >= start &&
      l.journal_entry?.entry_date <= end
    );

    // Helper to build drill entries from lines
    const toDrillEntries = (filtered: any[]): DrillEntry[] =>
      filtered.map(l => ({
        id: l.id,
        entry_date: l.journal_entry?.entry_date ?? "",
        description: l.description || l.journal_entry?.description || "",
        amount: Number(l.debit || 0) + Number(l.credit || 0),
      })).sort((a, b) => b.entry_date.localeCompare(a.entry_date));

    // ─── CASH-BASIS APPROACH ─────────────────────────────────────────
    // Build the statement from actual Cash (1000) account movements.
    // Group all lines by journal_entry_id so we can inspect sibling
    // accounts to categorize each cash movement — this works regardless
    // of source_type, including migrated/historical JEs.
    // ─────────────────────────────────────────────────────────────────

    const jeGroups = new Map<string, any[]>();
    for (const line of lines) {
      const jeId = line.journal_entry?.id;
      if (!jeId) continue;
      if (!jeGroups.has(jeId)) jeGroups.set(jeId, []);
      jeGroups.get(jeId)!.push(line);
    }

    // Category buckets (each holds the Cash-account line for drill-down)
    const operatingInLines: any[] = [];   // DR Cash — revenue / customer payments
    const operatingOutLines: any[] = [];  // CR Cash — vendor / G&A payments
    const drawInLines: any[] = [];        // DR Cash — loan draw proceeds
    const capitalInLines: any[] = [];     // DR Cash — capital contributions
    const loanPayOutLines: any[] = [];    // CR Cash — loan principal payments
    const ownerDrawOutLines: any[] = [];  // CR Cash — owner draws / distributions

    for (const [, jeLines] of jeGroups) {
      // Find Cash (1000) lines in this JE
      const cashLines = jeLines.filter((l: any) => l.account?.account_number === '1000');
      if (cashLines.length === 0) continue;

      // Collect sibling account numbers for categorization
      const siblings = jeLines.filter((l: any) => l.account?.account_number !== '1000');
      const siblingAccts = siblings.map((l: any) => l.account?.account_number ?? '');
      const siblingTypes = siblings.map((l: any) => l.account?.type ?? '');

      // Determine if siblings include financing-related accounts
      const hasLoanPayable = siblingAccts.some((a: string) => a.startsWith('22') || a === '2100');
      const hasDueFromLender = siblingAccts.some((a: string) => a === '1120');
      const hasEquity = siblingAccts.some((a: string) => a.startsWith('30')) || siblingTypes.includes('equity');
      const hasDistributions = siblingAccts.some((a: string) => a.startsWith('32'));

      for (const cashLine of cashLines) {
        const debit = Number(cashLine.debit || 0);
        const credit = Number(cashLine.credit || 0);

        if (debit > 0) {
          // Cash inflow — categorize by what the counter-accounts are
          if (hasDueFromLender || hasLoanPayable) {
            drawInLines.push(cashLine);        // Loan draw funded
          } else if (hasEquity) {
            capitalInLines.push(cashLine);      // Capital contribution
          } else {
            operatingInLines.push(cashLine);    // Revenue / customer payment / other
          }
        }

        if (credit > 0) {
          // Cash outflow — categorize by what the counter-accounts are
          if (hasLoanPayable) {
            loanPayOutLines.push(cashLine);     // Loan principal payment
          } else if (hasDistributions) {
            ownerDrawOutLines.push(cashLine);   // Owner draw / distribution
          } else {
            operatingOutLines.push(cashLine);   // Vendor payment / G&A / other
          }
        }
      }
    }

    // Sum helpers
    const sumDebit = (arr: any[]) => arr.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const sumCredit = (arr: any[]) => arr.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

    const cashFromCustomers = sumDebit(operatingInLines);
    const cashToVendors = sumCredit(operatingOutLines);
    const cashFromDraws = sumDebit(drawInLines);
    const capitalContribs = sumDebit(capitalInLines);
    const loanPayments = sumCredit(loanPayOutLines);
    const ownerDraws = sumCredit(ownerDrawOutLines);

    const operating: CashFlowSection = {
      title: "Operating Activities",
      lines: [
        { label: "Cash received from customers", amount: cashFromCustomers, entries: toDrillEntries(operatingInLines) },
        ...(cashToVendors > 0 ? [{ label: "Cash paid to vendors & subcontractors", amount: cashToVendors, entries: toDrillEntries(operatingOutLines), isSubtraction: true }] : []),
      ],
      total: cashFromCustomers - cashToVendors,
    };

    const investing: CashFlowSection = {
      title: "Investing Activities",
      lines: [],
      total: 0,
    };

    const financing: CashFlowSection = {
      title: "Financing Activities",
      lines: [
        ...(cashFromDraws > 0 ? [{ label: "Construction loan draws received", amount: cashFromDraws, entries: toDrillEntries(drawInLines) }] : []),
        ...(capitalContribs > 0 ? [{ label: "Capital contributions", amount: capitalContribs, entries: toDrillEntries(capitalInLines) }] : []),
        ...(loanPayments > 0 ? [{ label: "Loan payments made", amount: loanPayments, entries: toDrillEntries(loanPayOutLines), isSubtraction: true }] : []),
        ...(ownerDraws > 0 ? [{ label: "Owner draws & distributions", amount: ownerDraws, entries: toDrillEntries(ownerDrawOutLines), isSubtraction: true }] : []),
      ],
      total: cashFromDraws + capitalContribs - loanPayments - ownerDraws,
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
