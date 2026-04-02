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
}

interface CashFlowLine {
  label: string;
  amount: number;
  entries: GLEntry[];
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
  return { start: `${y}-01-01`, end: today };
}

export default function CashFlowClient() {
  const [preset, setPreset] = useState<DatePreset>("this_year");
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
    const { data: entries } = await supabase
      .from("gl_entries")
      .select("id, entry_date, description, amount, debit_account, credit_account, source_type")
      .gte("entry_date", start).lte("entry_date", end).order("entry_date");

    const gl: GLEntry[] = entries ?? [];

    const revenueEntries = gl.filter(e => /revenue|income|sale/i.test(e.credit_account) || /sale_settlement|home_sale|lot_sale/i.test(e.source_type));
    const vendorPayEntries = gl.filter(e => /invoice_payment/i.test(e.source_type) || (/cash|checking/i.test(e.credit_account) && /cost|expense|labor|material/i.test(e.debit_account)));

    let cashFromCustomers = revenueEntries.reduce((s, e) => s + e.amount, 0);
    let cashToVendors = vendorPayEntries.reduce((s, e) => s + e.amount, 0);

    const fallbackRevenueEntries: GLEntry[] = [...revenueEntries];
    const fallbackVendorEntries: GLEntry[] = [...vendorPayEntries];

    if (gl.length === 0) {
      const [paidInvRes, salesRes] = await Promise.all([
        supabase.from("invoices").select("id, vendor, invoice_number, amount, payment_date").eq("status", "paid").gte("payment_date", start).lte("payment_date", end),
        supabase.from("sales").select("id, description, settled_amount, contract_price, settled_date, is_settled").eq("is_settled", true).gte("settled_date", start).lte("settled_date", end),
      ]);

      const paidInvoices = paidInvRes.data ?? [];
      const settledSales = salesRes.data ?? [];

      cashToVendors = paidInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);
      cashFromCustomers = settledSales.reduce((s, s2) => s + (s2.settled_amount ?? s2.contract_price ?? 0), 0);

      fallbackVendorEntries.push(...paidInvoices.map(i => ({
        id: i.id, entry_date: i.payment_date ?? "",
        description: `${i.vendor ?? "Vendor"} · #${i.invoice_number ?? "—"}`,
        amount: i.amount ?? 0, debit_account: "Construction Costs",
        credit_account: "Cash", source_type: "invoice_payment",
      })));
      fallbackRevenueEntries.push(...settledSales.map(s => ({
        id: s.id, entry_date: s.settled_date ?? "", description: s.description,
        amount: s.settled_amount ?? s.contract_price ?? 0,
        debit_account: "Cash", credit_account: "Revenue", source_type: "sale_settlement",
      })));
    }

    const investingEntries = gl.filter(e => /investing|land|purchase|acquisition/i.test(e.source_type) || /land|real estate|equipment/i.test(e.debit_account));
    const cashInvesting = investingEntries.reduce((s, e) => s + e.amount, 0);

    const drawEntries = gl.filter(e => /loan_draw|draw_funded/i.test(e.source_type) || /loans payable|construction loan/i.test(e.credit_account));
    const loanPayEntries = gl.filter(e => /loan_payment/i.test(e.source_type) || /loans payable|construction loan/i.test(e.debit_account));
    let cashFromDraws = drawEntries.reduce((s, e) => s + e.amount, 0);
    const cashForLoanPay = loanPayEntries.reduce((s, e) => s + e.amount, 0);

    const fallbackDrawEntries: GLEntry[] = [...drawEntries];
    if (cashFromDraws === 0) {
      const { data: draws } = await supabase
        .from("loan_draws").select("id, total_amount, draw_date, draw_number")
        .eq("status", "funded").gte("draw_date", start).lte("draw_date", end);
      const drawList = draws ?? [];
      cashFromDraws = drawList.reduce((s, d) => s + d.total_amount, 0);
      fallbackDrawEntries.push(...drawList.map(d => ({
        id: d.id, entry_date: d.draw_date, description: `Draw #${d.draw_number}`,
        amount: d.total_amount, debit_account: "Cash",
        credit_account: "Construction Loans Payable", source_type: "loan_draw",
      })));
    }

    const operating: CashFlowSection = {
      title: "Operating Activities",
      lines: [
        { label: "Cash received from customers", amount: cashFromCustomers, entries: fallbackRevenueEntries },
        { label: "Cash paid to vendors & subcontractors", amount: cashToVendors, entries: fallbackVendorEntries, isSubtraction: true },
      ],
      total: cashFromCustomers - cashToVendors,
    };
    const investing: CashFlowSection = {
      title: "Investing Activities",
      lines: [{ label: "Capital expenditures / land purchases", amount: cashInvesting, entries: investingEntries, isSubtraction: true }],
      total: -cashInvesting,
    };
    const financing: CashFlowSection = {
      title: "Financing Activities",
      lines: [
        { label: "Loan draws received", amount: cashFromDraws, entries: fallbackDrawEntries },
        { label: "Loan payments made", amount: cashForLoanPay, entries: loanPayEntries, isSubtraction: true },
      ],
      total: cashFromDraws - cashForLoanPay,
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
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
          )}
        </div>
        <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">Total</span>
          <span className="text-sm font-semibold text-gray-900">{fmtFull(line.amount)}</span>
        </div>
      </div>
    </div>
  );
}
