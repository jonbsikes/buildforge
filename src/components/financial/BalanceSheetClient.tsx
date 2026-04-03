// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown, X, BookOpen } from "lucide-react";

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

interface JELine {
  id: string;
  entry_date: string;
  reference: string;
  je_description: string;
  line_description: string;
  debit: number;
  credit: number;
}

interface AccountBalance {
  account_number: string;
  name: string;
  type: string;
  subtype: string;
  debit: number;
  credit: number;
  balance: number; // normal balance: debit-normal for assets/expenses, credit-normal for liabilities/equity/revenue
  lines: JELine[]; // individual JE lines for drill-down
}

interface BalanceSheetData {
  // Assets
  currentAssets: AccountBalance[];
  longTermAssets: AccountBalance[];
  totalAssets: number;
  // Liabilities
  currentLiabilities: AccountBalance[];
  longTermLiabilities: AccountBalance[];
  apFromInvoices: number;
  apInvoices: GLEntry[];
  totalLiabilities: number;
  // Equity
  equityAccounts: AccountBalance[];
  retainedEarnings: number;
  totalEquity: number;
}

function acctToGLEntries(acct: AccountBalance): GLEntry[] {
  return acct.lines
    .filter(l => l.debit > 0 || l.credit > 0)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    .map(l => ({
      id: l.id,
      entry_date: l.entry_date,
      description: l.line_description || l.je_description,
      amount: l.debit > 0 ? l.debit : -l.credit,
      debit_account: l.reference,
      credit_account: "",
      source_type: "journal_entry",
    }));
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

    // Fetch GL data and unpaid invoices in parallel
    const [ledgerRes, invoicesRes] = await Promise.all([
      supabase.from("journal_entry_lines").select(`
        id, debit, credit, description,
        account:chart_of_accounts(account_number, name, type, subtype, is_active),
        journal_entry:journal_entries(id, entry_date, status, description, reference)
      `),
      supabase.from("invoices")
        .select("id, vendor, invoice_number, amount, due_date, invoice_date, status")
        .in("status", ["pending_review", "approved", "scheduled"])
        .lte("invoice_date", asOf),
    ]);

    // Filter to posted entries within date range
    const ledgerLines = (ledgerRes.data ?? []).filter((l: any) =>
      l.journal_entry?.status === "posted" && l.journal_entry?.entry_date <= asOf
    );

    // Aggregate by account and collect individual lines
    const acctMap: Record<string, AccountBalance> = {};
    for (const line of ledgerLines) {
      const acc = line.account as any;
      const je = line.journal_entry as any;
      if (!acc || acc.is_active === false) continue;
      const key = acc.account_number;
      if (!acctMap[key]) {
        acctMap[key] = {
          account_number: acc.account_number,
          name: acc.name,
          type: acc.type ?? "",
          subtype: acc.subtype ?? "",
          debit: 0,
          credit: 0,
          balance: 0,
          lines: [],
        };
      }
      acctMap[key].debit += Number(line.debit ?? 0);
      acctMap[key].credit += Number(line.credit ?? 0);
      acctMap[key].lines.push({
        id: line.id,
        entry_date: je?.entry_date ?? "",
        reference: je?.reference ?? "",
        je_description: je?.description ?? "",
        line_description: (line as any).description ?? "",
        debit: Number(line.debit ?? 0),
        credit: Number(line.credit ?? 0),
      });
    }

    // Compute normal balances
    for (const acct of Object.values(acctMap)) {
      if (acct.type === "asset" || acct.type === "expense" || acct.type === "cogs") {
        acct.balance = acct.debit - acct.credit; // debit-normal
      } else {
        acct.balance = acct.credit - acct.debit; // credit-normal (liability, equity, revenue)
      }
    }

    const accounts = Object.values(acctMap).sort((a, b) => a.account_number.localeCompare(b.account_number));

    // Categorize accounts
    const currentAssets = accounts.filter(a => a.type === "asset" && a.account_number < "1200");
    const longTermAssets = accounts.filter(a => a.type === "asset" && a.account_number >= "1200");
    const currentLiab = accounts.filter(a => a.type === "liability" && a.account_number < "2100");
    const longTermLiab = accounts.filter(a => a.type === "liability" && a.account_number >= "2100");
    const equityAccounts = accounts.filter(a => a.type === "equity");

    // Revenue, COGS, Expenses -> Retained Earnings
    const revenue = accounts.filter(a => a.type === "revenue").reduce((s, a) => s + a.balance, 0);
    const cogs = accounts.filter(a => a.type === "cogs").reduce((s, a) => s + a.balance, 0);
    const expenses = accounts.filter(a => a.type === "expense").reduce((s, a) => s + a.balance, 0);
    const retainedEarnings = revenue - cogs - expenses; // net income flows to retained earnings

    // AP from unpaid invoices (supplementary - not in GL yet)
    const unpaidInvoices = invoicesRes.data ?? [];
    const apFromInvoices = unpaidInvoices.reduce((s: number, i: any) => s + (i.amount ?? 0), 0);
    const apEntries: GLEntry[] = unpaidInvoices.map((i: any) => ({
      id: i.id,
      entry_date: i.invoice_date ?? "",
      description: `${i.vendor ?? "Unknown"} · #${i.invoice_number ?? "—"}`,
      amount: i.amount ?? 0,
      debit_account: "Construction Costs",
      credit_account: "Accounts Payable",
      source_type: "invoice",
    }));

    // Totals
    const totalAssets = currentAssets.reduce((s, a) => s + a.balance, 0) + longTermAssets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = currentLiab.reduce((s, a) => s + a.balance, 0) + longTermLiab.reduce((s, a) => s + a.balance, 0) + apFromInvoices;
    const totalEquityFromGL = equityAccounts.reduce((s, a) => s + a.balance, 0);
    const totalEquity = totalEquityFromGL + retainedEarnings;

    setData({
      currentAssets,
      longTermAssets,
      totalAssets,
      currentLiabilities: currentLiab,
      longTermLiabilities: longTermLiab,
      apFromInvoices,
      apInvoices: apEntries,
      totalLiabilities,
      equityAccounts,
      retainedEarnings,
      totalEquity,
    });
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
          <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
        ) : !data ? null : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 text-center" style={{ backgroundColor: "#4272EF" }}>
              <h2 className="text-base font-bold text-white">Balance Sheet</h2>
              <p className="text-xs text-blue-100 mt-0.5">As of {asOf}</p>
            </div>

            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
              {/* LEFT COLUMN - ASSETS */}
              <div className="p-6">
                <BSSectionHeader title="Assets" />

                {data.currentAssets.length > 0 && (
                  <BSGroup label="Current Assets" items={data.currentAssets.map(a => ({
                    label: a.name,
                    amount: a.balance,
                    drillable: a.lines.length > 0,
                    onDrill: () => setDrill({
                      label: a.name,
                      amount: a.balance,
                      entries: acctToGLEntries(a),
                    }),
                  }))} />
                )}

                {data.longTermAssets.length > 0 && (
                  <BSGroup label="Long-Term Assets" items={data.longTermAssets.map(a => ({
                    label: a.name,
                    amount: a.balance,
                    drillable: a.lines.length > 0,
                    onDrill: () => setDrill({
                      label: a.name,
                      amount: a.balance,
                      entries: acctToGLEntries(a),
                    }),
                  }))} />
                )}

                <TotalRow label="Total Assets" amount={data.totalAssets} />
              </div>

              {/* RIGHT COLUMN - LIABILITIES & EQUITY */}
              <div className="p-6">
                <BSSectionHeader title="Liabilities" />

                <BSGroup label="Current Liabilities" items={[
                  ...(data.apFromInvoices > 0 ? [{
                    label: "Accounts Payable",
                    amount: data.apFromInvoices,
                    drillable: true,
                    onDrill: () => setDrill({ label: "Accounts Payable", amount: data.apFromInvoices, entries: data.apInvoices }),
                  }] : []),
                  ...data.currentLiabilities.map(a => ({
                    label: a.name,
                    amount: a.balance,
                    drillable: a.lines.length > 0,
                    onDrill: () => setDrill({
                      label: a.name,
                      amount: a.balance,
                      entries: acctToGLEntries(a),
                    }),
                  })),
                ]} />

                {data.longTermLiabilities.length > 0 && (
                  <BSGroup label="Long-Term Liabilities" items={data.longTermLiabilities.map(a => ({
                    label: a.name,
                    amount: a.balance,
                    drillable: a.lines.length > 0,
                    onDrill: () => setDrill({
                      label: a.name,
                      amount: a.balance,
                      entries: acctToGLEntries(a),
                    }),
                  }))} />
                )}

                <TotalRow label="Total Liabilities" amount={data.totalLiabilities} />

                <div className="mt-6">
                  <BSSectionHeader title="Equity" />
                  <BSGroup label="Equity Accounts" items={[
                    ...data.equityAccounts.map(e => ({
                      label: `${e.name}`,
                      amount: e.balance,
                      drillable: e.lines.length > 0,
                      onDrill: () => setDrill({
                        label: e.name,
                        amount: e.balance,
                        entries: acctToGLEntries(e),
                      }),
                    })),
                    ...(Math.abs(data.retainedEarnings) > 0.01 ? [{
                      label: "Retained Earnings (Net Income)",
                      amount: data.retainedEarnings,
                      drillable: false,
                    }] : []),
                  ]} />
                  <TotalRow label="Total Equity" amount={data.totalEquity} />
                  <TotalRow label="Total Liabilities + Equity" amount={data.totalLiabilities + data.totalEquity} />
                </div>

                <div className={`mt-4 px-3 py-2 rounded-lg text-xs font-medium text-center ${Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)) < 1 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                  {Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)) < 1
                    ? "\u2713 Balance sheet is balanced"
                    : `\u26A0 Difference: ${fmt(Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)))}`}
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
  if (items.length === 0) return null;
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
          <span className="font-medium text-gray-800">{fmt(item.amount)}</span>
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
  const isGLDrill = item.entries.length > 0 && item.entries[0].source_type === "journal_entry";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
          <div>
            <h3 className="font-semibold text-white">{item.label}</h3>
            <p className="text-xs text-blue-100 mt-0.5">{item.entries.length} entries · Balance: {fmtFull(item.amount)}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="overflow-auto flex-1">
          {item.entries.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No detail entries available.</div>
          ) : isGLDrill ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                  <tr className="text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Ref</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-right">Debit</th>
                    <th className="px-4 py-3 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {item.entries.map(e => {
                    const debit = e.amount > 0 ? e.amount : 0;
                    const credit = e.amount < 0 ? -e.amount : 0;
                    return (
                      <tr key={e.id} className="border-b border-gray-50">
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{e.entry_date}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{e.debit_account}</td>
                        <td className="px-4 py-2.5 text-gray-700">{e.description}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800">{debit > 0 ? fmtFull(debit) : ""}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800">{credit > 0 ? fmtFull(credit) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
                  {item.entries.map(e => (
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
          <span className="text-sm font-semibold text-gray-700">Balance</span>
          <span className="text-sm font-semibold text-gray-900">{fmtFull(item.amount)}</span>
        </div>
      </div>
    </div>
  );
}
