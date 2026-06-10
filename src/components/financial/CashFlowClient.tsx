"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { X, ChevronDown } from "lucide-react";
import ReportExportButtons from "@/components/ui/ReportExportButtons";
import {
  parseCashFlowBuckets,
  buildCashFlowStatementSections,
  type CashFlowStatementSection,
  type CashFlowStatementLine,
} from "@/lib/reports/cashflow-shared";

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
  reference: string | null;
  description: string;
  amount: number;
}

interface DrillState {
  line: CashFlowStatementLine;
  entries: DrillEntry[];
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
  const [sections, setSections] = useState<CashFlowStatementSection[]>([]);
  const [netChange, setNetChange] = useState(0);
  const [beginningCash, setBeginningCash] = useState(0);
  const [endingCash, setEndingCash] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = preset === "custom" ? { start: customStart, end: customEnd } : getPresetRange(preset);
    if (!start || !end) { setLoading(false); return; }

    const supabase = createClient();

    // ─── DIRECT-METHOD STATEMENT ─────────────────────────────────────
    // Built from actual cash-account movement via get_cash_flow_statement
    // (migration 041). Buckets partition every posted cash JE line exactly,
    // so beginning cash + net change = ending cash = GL cash balance.
    // The same RPC + shaping powers the PDF and Excel exports.
    // ─────────────────────────────────────────────────────────────────
    const { data: bucketData } = await (supabase.rpc as any)("get_cash_flow_statement", {
      p_start: start,
      p_end: end,
    });
    const b = parseCashFlowBuckets(((bucketData ?? []) as Record<string, number | string>[])[0]);
    const built = buildCashFlowStatementSections(b);

    setSections([built.operating, built.investing, built.financing]);
    setNetChange(built.netChange);
    setBeginningCash(b.beginning_cash);
    setEndingCash(b.ending_cash);
    setLoading(false);
  }, [preset, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  const openDrill = useCallback(async (line: CashFlowStatementLine) => {
    // Drill-down: cash JE lines for this bucket, classified server-side with
    // the exact same rules as the totals (get_cash_flow_lines, migration 041).
    const { start, end } = preset === "custom" ? { start: customStart, end: customEnd } : getPresetRange(preset);
    if (!start || !end) return;
    const supabase = createClient();
    type LineRow = {
      line_id: string;
      entry_date: string;
      reference: string | null;
      description: string | null;
      bucket: string;
      amount: number;
    };
    const { data } = await (supabase.rpc as any)("get_cash_flow_lines", { p_start: start, p_end: end });
    const entries: DrillEntry[] = ((data ?? []) as LineRow[])
      .filter((r) => r.bucket === line.bucket)
      .map((r) => ({
        id: r.line_id,
        entry_date: r.entry_date,
        reference: r.reference,
        description: r.description ?? "",
        amount: Number(r.amount),
      }));
    setDrill({ line, entries });
  }, [preset, customStart, customEnd]);

  const rangeLabel = preset === "custom"
    ? `${customStart} – ${customEnd}`
    : preset.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const exportRange = preset === "custom"
    ? { start: customStart || undefined, end: customEnd || undefined }
    : getPresetRange(preset);

  return (
    <>
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-end mb-4 print:hidden">
          <ReportExportButtons slug="cash-flow" params={{ start: exportRange.start, end: exportRange.end }} />
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
                <CFSection key={section.title} section={section} onDrill={openDrill} />
              ))}
              <div className="border-t-2 border-gray-300 pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900 text-base">Net Change in Cash</span>
                  <span className={`font-bold text-base ${netChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {netChange < 0 ? `(${fmt(Math.abs(netChange))})` : fmt(netChange)}
                  </span>
                </div>
              </div>

              {/* Reconciliation to the GL cash balance */}
              <div className="rounded-lg border border-gray-100 bg-gray-50/60 divide-y divide-gray-100">
                <div className="flex justify-between items-center px-4 py-2 text-sm">
                  <span className="text-gray-600">Cash at beginning of period</span>
                  <span className="text-gray-800 tabular-nums">{fmtFull(beginningCash)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2 text-sm">
                  <span className="text-gray-600">Net change in cash</span>
                  <span className="text-gray-800 tabular-nums">{netChange < 0 ? `(${fmtFull(Math.abs(netChange))})` : fmtFull(netChange)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5 font-semibold text-sm bg-blue-50/60">
                  <span className="text-gray-900">Cash at end of period <span className="text-xs text-gray-500 font-normal">(ties to GL cash accounts)</span></span>
                  <span className="text-gray-900 tabular-nums">{fmtFull(endingCash)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {drill && <CFDrillModal drill={drill} onClose={() => setDrill(null)} />}
    </>
  );
}

function CFSection({ section, onDrill }: { section: CashFlowStatementSection; onDrill: (l: CashFlowStatementLine) => void }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4272EF] mb-2">{section.title}</h3>
      {section.lines.length === 0 ? (
        <p className="text-xs text-gray-400 py-1 pl-4">{section.note ?? "No activity for this period."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm mb-2">
            <tbody>
              {section.lines.map(line => (
                <tr key={line.bucket} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors group" onClick={() => onDrill(line)}>
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
          {section.note && <p className="text-[11px] text-gray-400 pl-4 mb-1">{section.note}</p>}
        </div>
      )}
      <div className="flex justify-between items-center border-t border-gray-200 pt-2">
        <span className="text-sm font-semibold text-gray-700">Net Cash from {section.title}</span>
        <span className={`text-sm font-semibold ${section.total >= 0 ? "text-green-700" : "text-red-700"}`}>
          {section.total < 0 ? `(${fmt(Math.abs(section.total))})` : fmt(section.total)}
        </span>
      </div>
    </div>
  );
}

function CFDrillModal({ drill, onClose }: { drill: DrillState; onClose: () => void }) {
  const { line, entries } = drill;
  const total = entries.reduce((s, e) => s + e.amount, 0);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
          <div>
            <h3 className="font-semibold text-white">{line.label}</h3>
            <p className="text-xs text-blue-100 mt-0.5">{entries.length} entries · Total: {fmtFull(total)}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1">
          {entries.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No entries for this period.</div>
          ) : (
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
                {entries.map(e => (
                  <tr key={e.id} className="border-b border-gray-50">
                    <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{e.entry_date}</td>
                    <td className="px-5 py-2.5 text-gray-400 font-mono text-xs whitespace-nowrap">{e.reference ?? "—"}</td>
                    <td className="px-5 py-2.5 text-gray-700">{e.description}</td>
                    <td className="px-5 py-2.5 text-right font-medium text-gray-800 tabular-nums">{fmtFull(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">Total</span>
          <span className="text-sm font-semibold text-gray-900">{fmtFull(total)}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
