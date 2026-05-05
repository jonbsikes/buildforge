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

/** Fetch JE lines for a specific account on demand (drill-down) */
async function fetchAccountLines(accountNumber: string, asOf: string): Promise<JELine[]> {
  const supabase = createClient();
  type LineRow = {
    id: string;
    debit: number | null;
    credit: number | null;
    description: string | null;
    journal_entry: { entry_date: string; reference: string | null; description: string | null; status: string } | null;
    account: { account_number: string } | null;
  };
  let allLines: LineRow[] = [];
  let fromIdx = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: page } = await supabase
      .from("journal_entry_lines")
      .select(`
        id, debit, credit, description,
        journal_entry:journal_entries(entry_date, reference, description, status),
        account:chart_of_accounts!inner(account_number)
      `)
      .eq("account.account_number", accountNumber)
      .range(fromIdx, fromIdx + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    allLines = allLines.concat(page as unknown as LineRow[]);
    if (page.length < PAGE_SIZE) break;
    fromIdx += PAGE_SIZE;
  }
  return allLines
    .filter(l => l.journal_entry?.status === "posted" && (l.journal_entry?.entry_date ?? "") <= asOf)
    .map(l => ({
      id: l.id,
      entry_date: l.journal_entry?.entry_date ?? "",
      reference: l.journal_entry?.reference ?? "",
      je_description: l.journal_entry?.description ?? "",
      line_description: l.description ?? "",
      debit: Number(l.debit ?? 0),
      credit: Number(l.credit ?? 0),
    }));
}

export default function BalanceSheetClient() {
  const today = new Date().toISOString().split("T")[0];
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<DrillItem | null>(null);

  const openDrill = useCallback(async (acct: AccountBalance) => {
    // Load lines on demand for drill-down
    const lines = await fetchAccountLines(acct.account_number, asOf);
    const tempAcct = { ...acct, lines };
    setDrill({
      label: acct.name,
      amount: acct.balance,
      entries: acctToGLEntries(tempAcct),
    });
  }, [asOf]);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    // Fetch the sum of available (unapplied) vendor credits in parallel —
    // used to split the AP line on the balance sheet into "AP Trade (gross)"
    // and "Less: Vendor Credits Available" so the totals reconcile to what
    // the AP invoices page shows. Pure display split; GL is unchanged.
    const [{ data: openCredits }, { data: rpcData }] = await Promise.all([
      supabase
        .from("vendor_credits")
        .select("amount, applied_amount")
        .eq("status", "available"),
      supabase.rpc("get_balance_sheet_data", { p_as_of_date: asOf }),
    ]);
    const creditsAvailable = (openCredits ?? []).reduce(
      (s, c) => s + Math.max(0, Number(c.amount) - Number(c.applied_amount ?? 0)),
      0
    );

    // Shape returned by the RPC function
    type RpcRow = {
      account_number: string;
      account_name: string;
      account_type: string;
      account_subtype: string | null;
      total_debit: number;
      total_credit: number;
      project_id: string | null;
      project_name: string | null;
    };

    const rows = (rpcData ?? []) as RpcRow[];

    // Aggregate by account (the RPC returns per-project rows, so we combine)
    const acctMap: Record<string, AccountBalance> = {};
    const WIP_CIP_ACCOUNTS = new Set(["1210", "1230"]);
    const projMap: Record<string, Record<string, { project_id: string; project_name: string; debit: number; credit: number }>> = {};

    for (const row of rows) {
      const key = row.account_number;
      if (!acctMap[key]) {
        acctMap[key] = {
          account_number: row.account_number,
          name: row.account_name,
          type: row.account_type ?? "",
          subtype: row.account_subtype ?? "",
          debit: 0,
          credit: 0,
          balance: 0,
          lines: [], // drill-down lines loaded on demand
        };
      }
      acctMap[key].debit += Number(row.total_debit);
      acctMap[key].credit += Number(row.total_credit);

      // Build per-project breakdown for WIP/CIP accounts
      if (WIP_CIP_ACCOUNTS.has(row.account_number) && row.project_id) {
        if (!projMap[key]) projMap[key] = {};
        projMap[key][row.project_id] = {
          project_id: row.project_id,
          project_name: row.project_name ?? "Unknown Project",
          debit: Number(row.total_debit),
          credit: Number(row.total_credit),
        };
      }
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
    const currentLiabRaw = accounts.filter(a => a.type === "liability" && a.account_number < "2100" && nonZero(a));

    // Split AP (account 2000) into "Trade (gross)" + "Less: Vendor Credits
    // Available" when there are unapplied credits sitting in the AP control
    // account. Both rows together still equal the GL balance — no GL change,
    // just a display split so the balance sheet AP line reconciles to the
    // gross approved-invoice total shown on the AP invoices page.
    const currentLiab: AccountBalance[] = [];
    for (const a of currentLiabRaw) {
      if (a.account_number === "2000" && creditsAvailable > 0.005) {
        const grossAp = a.balance + creditsAvailable; // net + credits_in_AP = gross
        currentLiab.push({
          ...a,
          name: "Accounts Payable - Trade",
          balance: grossAp,
        });
        currentLiab.push({
          account_number: "2000-CR",
          name: "Less: Vendor Credits Available",
          type: "liability",
          subtype: a.subtype,
          debit: 0,
          credit: 0,
          balance: -creditsAvailable,
          lines: [],
        });
      } else {
        currentLiab.push(a);
      }
    }
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
                  drillable: true,
                  onDrill: () => openDrill(a),
                }))} />
              )}

              {data.longTermAssets.length > 0 && (
                <BSGroup label="Long-Term Assets" items={data.longTermAssets.map(a => ({
                  label: a.name,
                  amount: a.balance,
                  drillable: true,
                  onDrill: () => openDrill(a),
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
                  drillable: true,
                  onDrill: () => openDrill(a),
                })),
              ]} />

              {data.longTermLiabilities.length > 0 && (
                <BSGroup label="Long-Term Liabilities" items={data.longTermLiabilities.map(a => ({
                  label: a.name,
                  amount: a.balance,
                  drillable: true,
                  onDrill: () => openDrill(a),
                }))} />
              )}

              <TotalRow label="Total Liabilities" amount={data.totalLiabilities} />

              <div className="mt-6">
                <BSSectionHeader title="Equity" />
                <BSGroup label="Member Capital (Net)" items={[
                  ...data.equityAccounts.map(e => ({
                    label: `${e.name}`,
                    amount: e.balance,
                    drillable: true,
                    onDrill: () => openDrill(e),
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
