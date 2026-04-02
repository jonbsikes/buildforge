"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown, X } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

interface GLEntry {
  id: string;
  entry_date: string;
  description: string;
  amount: number;
  debit_account: string;
  credit_account: string;
  source_type: string;
}

interface DrillItem {
  label: string;
  amount: number;
  entries: GLEntry[];
}

interface BalanceSheetData {
  cashAccounts: { id: string; bank_name: string; account_last_four: string }[];
  accountsReceivable: number;
  constructionInProgress: number;
  cipEntries: GLEntry[];
  totalAssets: number;
  accountsPayable: number;
  apInvoices: GLEntry[];
  loansPayable: number;
  loanEntries: GLEntry[];
  totalLiabilities: number;
  ownerEquity: number;
}

export default function BalanceSheetClient() {
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [accountsRes, invoicesRes, drawsRes, glRes, projectsRes, costItemsRes] = await Promise.all([
      supabase.from("bank_accounts").select("id, bank_name, account_last_four").eq("is_active", true).order("bank_name"),
      supabase.from("invoices").select("id, vendor, invoice_number, amount, due_date, invoice_date, status").in("status", ["pending_review", "approved", "scheduled"]).lte("invoice_date", asOf),
      supabase.from("loan_draws").select("id, total_amount, draw_date, draw_number, status").eq("status", "funded").lte("draw_date", asOf),
      supabase.from("gl_entries").select("id, entry_date, description, amount, debit_account, credit_account, source_type").lte("entry_date", asOf),
      supabase.from("projects").select("id, name, status"),
      supabase.from("cost_items").select("actual_amount, project_id"),
    ]);

    const accounts = accountsRes.data ?? [];
    const unpaidInvoices = invoicesRes.data ?? [];
    const fundedDraws = drawsRes.data ?? [];
    const glEntries = glRes.data ?? [];
    const projects = projectsRes.data ?? [];
    const costItems = costItemsRes.data ?? [];

    const apTotal = unpaidInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);
    const apEntries: GLEntry[] = unpaidInvoices.map(i => ({
      id: i.id, entry_date: i.invoice_date ?? "",
      description: `${i.vendor ?? "Unknown"} · #${i.invoice_number ?? "—"}`,
      amount: i.amount ?? 0, debit_account: "Construction Costs",
      credit_account: "Accounts Payable", source_type: "invoice",
    }));

    const loansPayable = fundedDraws.reduce((s, d) => s + d.total_amount, 0);
    const loanEntries: GLEntry[] = fundedDraws.map(d => ({
      id: d.id, entry_date: d.draw_date, description: `Draw #${d.draw_number}`,
      amount: d.total_amount, debit_account: "Cash",
      credit_account: "Construction Loans Payable", source_type: "loan_draw",
    }));

    const activeProjectIds = new Set(projects.filter(p => p.status === "active").map(p => p.id));
    const cip = costItems
      .filter(ci => ci.project_id && activeProjectIds.has(ci.project_id))
      .reduce((s, ci) => s + (ci.actual_amount ?? 0), 0);

    const cipEntries = glEntries.filter(e => /construction in progress|cip|wip/i.test(e.debit_account));
    const arEntries = glEntries.filter(e => /accounts receivable|receivable/i.test(e.debit_account));
    const accountsReceivable = arEntries.reduce((s, e) => s + e.amount, 0);
    const totalAssets = accountsReceivable + cip;
    const totalLiabilities = apTotal + loansPayable;
    const ownerEquity = totalAssets - totalLiabilities;

    setData({ cashAccounts: accounts, accountsReceivable, constructionInProgress: cip, cipEntries, totalAssets, accountsPayable: apTotal, apInvoices: apEntries, loansPayable, loanEntries, totalLiabilities, ownerEquity });
    setLoading(false);
  }, [asOf]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 font-medium">As of:</label>
            <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
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
              <h2 className="text-base font-bold text-white">Balance Sheet</h2>
              <p className="text-xs text-blue-100 mt-0.5">As of {asOf}</p>
            </div>

            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
              <div className="p-6">
                <BSSectionHeader title="Assets" />
                <BSGroup label="Current Assets" items={[
                  { label: "Cash — Bank Accounts", amount: 0, note: `${data.cashAccounts.length} active account${data.cashAccounts.length !== 1 ? "s" : ""} (balances tracked in Banking)`, drillable: false },
                  { label: "Accounts Receivable", amount: data.accountsReceivable, drillable: data.accountsReceivable > 0, onDrill: () => setDrill({ label: "Accounts Receivable", amount: data.accountsReceivable, entries: [] }) },
                ]} />
                <BSGroup label="Long-Term Assets" items={[
                  { label: "Construction in Progress", amount: data.constructionInProgress, drillable: data.constructionInProgress > 0, onDrill: () => setDrill({ label: "Construction in Progress", amount: data.constructionInProgress, entries: data.cipEntries }) },
                ]} />
                <TotalRow label="Total Assets" amount={data.totalAssets} />
              </div>

              <div className="p-6">
                <BSSectionHeader title="Liabilities" />
                <BSGroup label="Current Liabilities" items={[
                  { label: "Accounts Payable", amount: data.accountsPayable, drillable: data.accountsPayable > 0, onDrill: () => setDrill({ label: "Accounts Payable", amount: data.accountsPayable, entries: data.apInvoices }) },
                ]} />
                <BSGroup label="Long-Term Liabilities" items={[
                  { label: "Construction Loans Payable", amount: data.loansPayable, drillable: data.loansPayable > 0, onDrill: () => setDrill({ label: "Construction Loans Payable", amount: data.loansPayable, entries: data.loanEntries }) },
                ]} />
                <TotalRow label="Total Liabilities" amount={data.totalLiabilities} />
                <div className="mt-6">
                  <BSSectionHeader title="Equity" />
                  <BSGroup label="Owner Equity" items={[
                    { label: "Owner's Equity", amount: data.ownerEquity, drillable: false },
                  ]} />
                  <TotalRow label="Total Liabilities + Equity" amount={data.totalLiabilities + data.ownerEquity} />
                </div>
                <div className={`mt-4 px-3 py-2 rounded-lg text-xs font-medium text-center ${Math.abs(data.totalAssets - (data.totalLiabilities + data.ownerEquity)) < 1 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                  {Math.abs(data.totalAssets - (data.totalLiabilities + data.ownerEquity)) < 1
                    ? "✓ Balance sheet is balanced"
                    : `⚠ Difference: ${fmt(Math.abs(data.totalAssets - (data.totalLiabilities + data.ownerEquity)))}`}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {drill && <BSdrillModal item={drill} onClose={() => setDrill(null)} />}
    </>
  );
}

function BSSectionHeader({ title }: { title: string }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4272EF] mb-3">{title}</h3>;
}

function BSGroup({ label, items }: {
  label: string;
  items: { label: string; amount: number; note?: string; drillable: boolean; onDrill?: () => void }[];
}) {
  return (
    <div className="mb-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      {items.map(item => (
        <div key={item.label} onClick={item.drillable ? item.onDrill : undefined}
          className={`flex justify-between items-center py-1.5 px-2 rounded text-sm ${item.drillable ? "cursor-pointer hover:bg-blue-50 transition-colors" : ""}`}>
          <span className="text-gray-700">
            {item.label}
            {item.note && <span className="text-gray-400 text-xs ml-2">({item.note})</span>}
          </span>
          <span className="font-medium text-gray-800">{item.note && item.amount === 0 ? "—" : fmt(item.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function TotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between items-center border-t border-gray-200 pt-2 mt-1">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{fmt(amount)}</span>
    </div>
  );
}

function BSdrillModal({ item, onClose }: { item: DrillItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
          <div>
            <h3 className="font-semibold text-white">{item.label}</h3>
            <p className="text-xs text-blue-100 mt-0.5">{item.entries.length} entries · Total: {fmtFull(item.amount)}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1">
          {item.entries.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No GL entries found. Amount derived from cost items.</div>
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
                {item.entries.map(e => (
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
          <span className="text-sm font-semibold text-gray-900">{fmtFull(item.amount)}</span>
        </div>
      </div>
    </div>
  );
}
