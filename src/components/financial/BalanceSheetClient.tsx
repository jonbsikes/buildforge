// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { X, ChevronRight, ChevronDown } from "lucide-react";
import ReportChrome from "@/components/ui/ReportChrome";

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

interface ProjectBreakdown {
  project_id: string;
  project_name: string;
  balance: number;
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
  projectBreakdown?: ProjectBreakdown[];
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
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
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

    // Fetch GL data only — AP is fully captured in journal entries (no raw invoice supplement needed)
    const [ledgerRes] = await Promise.all([
      supabase.from("journal_entry_lines").select(`
        id, debit, credit, description, project_id,
        account:chart_of_accounts(account_number, name, type, subtype, is_active),
        journal_entry:journal_entries(id, entry_date, status, description, reference),
        project:projects(id, name)
      `),
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

    // Build per-project breakdown for WIP/CIP accounts
    const WIP_CIP_ACCOUNTS = new Set(["1210", "1230"]);
    const projMap: Record<string, Record<string, { project_id: string; project_name: string; debit: number; credit: number }>> = {};
    for (const line of ledgerLines) {
      const acc = (line as any).account;
      if (!acc || !WIP_CIP_ACCOUNTS.has(acc.account_number)) continue;
      const pid = (line as any).project_id;
      if (!pid) continue;
      const key = acc.account_number;
      if (!projMap[key]) projMap[key] = {};
      if (!projMap[key][pid]) {
        const proj = (line as any).project;
        projMap[key][pid] = { project_id: pid, project_name: proj?.name ?? "Unknown Project", debit: 0, credit: 0 };
      }
      projMap[key][pid].debit += Number(line.debit ?? 0);
      projMap[key][pid].credit += Number(line.credit ?? 0);
    }

    // Compute normal balances
    for (const acct of Object.values(acctMap)) {
      if (acct.type === "asset" || acct.type === "expense" || acct.type === "cogs") {
        acct.balance = acct.debit - acct.credit; // debit-normal
      } else {
        acct.balance = acct.credit - acct.debit; // credit-normal (liability, equity, revenue)
      }
      // Attach per-project breakdown for WIP/CIP
      if (WIP_CIP_ACCOUNTS.has(acct.account_number) && projMap[acct.account_number]) {
        acct.projectBreakdown = Object.values(projMap[acct.account_number])
          .map(p => ({ project_id: p.project_id, project_name: p.project_name, balance: p.debit - p.credit }))
          .filter(p => Math.abs(p.balance) > 0.01)
          .sort((a, b) => b.balance - a.balance);
      }
    }

    const accounts = Object.values(acctMap).sort((a, b) => a.account_number.localeCompare(b.account_number));

    // Categorize accounts
    const nonZero = (a: AccountBalance) => Math.abs(a.balance) >= 0.005;
    const currentAssets = accounts.filter(a => a.type === "asset" && a.account_number < "1200" && nonZero(a));
    const longTermAssets = accounts.filter(a => a.type === "asset" && a.account_number >= "1200" && nonZero(a));
    const currentLiab = accounts.filter(a => a.type === "liability" && a.account_number < "2100" && nonZero(a));
    const longTermLiab = accounts.filter(a => a.type === "liability" && a.account_number >= "2100" && nonZero(a));
    const equityAccounts = accounts.filter(a => a.type === "equity");

    // Net Member Capital accounts: combine capital + distributions per member into a single display line
    // Sikes: 3010 (capital) + 3110 (distributions, debit-normal so already negative in balance)
    // VeVea: 3020 (capital) + 3120 (distributions)
    const memberPairs: { label: string; capitalNums: string[]; distNums: string[] }[] = [
      { label: "Member Capital — Sikes", capitalNums: ["3010"], distNums: ["3110"] },
      { label: "Member Capital — VeVea", capitalNums: ["3020"], distNums: ["3120"] },
    ];
    const netMemberAccounts: AccountBalance[] = memberPairs
      .map(pair => {
        const capAccts = equityAccounts.filter(a => pair.capitalNums.includes(a.account_number));
        const distAccts = equityAccounts.filter(a => pair.distNums.includes(a.account_number));
        const allAccts = [...capAccts, ...distAccts];
        if (allAccts.length === 0) return null;
        // Net balance: capital (credit-normal positive) minus distributions (debit-normal, stored as negative balance)
        const netBalance = allAccts.reduce((s, a) => s + a.balance, 0);
        if (Math.abs(netBalance) < 0.005) return null; // skip zero-balance members
        const allLines = allAccts.flatMap(a => a.lines);
        return {
          account_number: capAccts[0]?.account_number ?? pair.capitalNums[0],
          name: pair.label,
          type: "equity",
          subtype: "capital",
          debit: allAccts.reduce((s, a) => s + a.debit, 0),
          credit: allAccts.reduce((s, a) => s + a.credit, 0),
          balance: netBalance,
          lines: allLines,
        } as AccountBalance;
      })
      .filter(Boolean) as AccountBalance[];

    // Any remaining equity accounts not covered by member pairs (e.g. retained earnings account)
    const pairedNums = memberPairs.flatMap(p => [...p.capitalNums, ...p.distNums]);
    const otherEquityAccounts = equityAccounts.filter(a => !pairedNums.includes(a.account_number));

    // Revenue, COGS, Expenses -> Retained Earnings
    const revenue = accounts.filter(a => a.type === "revenue").reduce((s, a) => s + a.balance, 0);
    const cogs = accounts.filter(a => a.type === "cogs").reduce((s, a) => s + a.balance, 0);
    const expenses = accounts.filter(a => a.type === "expense").reduce((s, a) => s + a.balance, 0);
    const retainedEarnings = revenue - cogs - expenses; // net income flows to retained earnings

    // AP is fully GL-driven — account 2000 carries the balance from invoice_approval JEs
    // No supplementary invoice query needed; both asset (CIP) and liability (AP) sides are in the ledger

    // Totals
    const totalAssets = currentAssets.reduce((s, a) => s + a.balance, 0) + longTermAssets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = currentLiab.reduce((s, a) => s + a.balance, 0) + longTermLiab.reduce((s, a) => s + a.balance, 0);
    const totalEquityFromGL = [...netMemberAccounts, ...otherEquityAccounts].reduce((s, a) => s + a.balance, 0);
    const totalEquity = totalEquityFromGL + retainedEarnings;

    setData({
      currentAssets,
      longTermAssets,
      totalAssets,
      currentLiabilities: currentLiab,
      longTermLiabilities: longTermLiab,
      apFromInvoices: 0,
      apInvoices: [],
      totalLiabilities,
      equityAccounts: [...netMemberAccounts, ...otherEquityAccounts],
      retainedEarnings,
      totalEquity,
    });
    setLoading(false);
  }, [asOf]);

  useEffect(() => { load(); }, [load]);

  return (
    <ReportChrome
      title="Balance Sheet"
      showDateRange={true}
      dateMode="asOf"
      onAsOfChange={setAsOf}
      loading={loading}
      exportSlug="balance-sheet"
    >
      {!data ? null : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                  projectBreakdown: a.projectBreakdown,
                }))} />
              )}

              <TotalRow label="Total Assets" amount={data.totalAssets} />
            </div>

            {/* RIGHT COLUMN - LIABILITIES & EQUITY */}
            <div className="p-6">
              <BSSectionHeader title="Liabilities" />

              <BSGroup label="Current Liabilities" items={[
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
                <BSGroup label="Member Capital (Net)" items={[
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

      {drill && <BSdrillPanel item={drill} onClose={() => setDrill(null)} />}
    </ReportChrome>
  );
}

function BSSectionHeader({ title }: { title: string }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4272EF] mb-3">{title}</h3>;
}

function BSGroup({ label, items }: {
  label: string;
  items: { label: string; amount: number; note?: string; drillable: boolean; onDrill?: () => void; projectBreakdown?: ProjectBreakdown[] }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      {items.map(item => (
        <BSGroupRow key={item.label} item={item} />
      ))}
    </div>
  );
}

function BSGroupRow({ item }: {
  item: { label: string; amount: number; note?: string; drillable: boolean; onDrill?: () => void; projectBreakdown?: ProjectBreakdown[] };
}) {
  const [expanded, setExpanded] = useState(!!item.projectBreakdown?.length);
  const hasBreakdown = item.projectBreakdown && item.projectBreakdown.length > 0;

  return (
    <div>
      <div className="flex items-center">
        {hasBreakdown && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mr-1 p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        <div
          onClick={item.drillable ? item.onDrill : undefined}
          className={`flex-1 flex justify-between items-center py-1.5 px-2 rounded text-sm ${item.drillable ? "cursor-pointer hover:bg-blue-50 transition-colors" : ""}`}
        >
          <span className="text-gray-700">
            {item.label}
            {item.note && <span className="text-gray-400 text-xs ml-2">({item.note})</span>}
          </span>
          <span className="font-medium text-gray-800">{fmt(item.amount)}</span>
        </div>
      </div>
      {hasBreakdown && expanded && (
        <div className="ml-6 border-l-2 border-gray-100 pl-2 mb-1">
          {item.projectBreakdown!.map(p => (
            <div key={p.project_id} className="flex justify-between items-center py-1 px-2 text-xs">
              <span className="text-gray-500">{p.project_name}</span>
              <span className="text-gray-500 tabular-nums">{fmt(p.balance)}</span>
            </div>
          ))}
        </div>
      )}
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

function BSdrillPanel({ item, onClose }: { item: DrillItem; onClose: () => void }) {
  const isGLDrill = item.entries.length > 0 && item.entries[0].source_type === "journal_entry";
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-5xl bg-white shadow-2xl flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-[#4272EF]">
          <div>
            <h3 className="font-semibold text-white">{item.label}</h3>
            <p className="text-xs text-blue-100 mt-0.5">{item.entries.length} entries · Balance: {fmtFull(item.amount)}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X size={18} />
          </button>
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
                  {item.entries.map((e, idx) => {
                    const debit = e.amount > 0 ? e.amount : 0;
                    const credit = e.amount < 0 ? -e.amount : 0;
                    return (
                      <tr key={e.id} className={`border-b border-gray-50 ${idx % 2 === 0 ? "bg-gray-50/50" : ""}`}>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{e.entry_date}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{e.debit_account}</td>
                        <td className="px-4 py-2.5 text-gray-700">{e.description}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums">{debit > 0 ? fmtFull(debit) : ""}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums">{credit > 0 ? fmtFull(credit) : ""}</td>
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
                  {item.entries.map((e, idx) => (
                    <tr key={e.id} className={`border-b border-gray-50 ${idx % 2 === 0 ? "bg-gray-50/50" : ""}`}>
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{e.entry_date}</td>
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
          <span className="text-sm font-semibold text-gray-700">Balance</span>
          <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmtFull(item.amount)}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
