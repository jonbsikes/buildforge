"use client";

import { useState, useTransition } from "react";
import {
  Upload,
  Filter,
  CheckCircle2,
  AlertCircle,
  EyeOff,
  Eye,
  Unlink,
  Building2,
} from "lucide-react";
import {
  getBankTransactions,
  unmatchTransaction,
  ignoreTransaction,
  type BankTransactionRow,
} from "@/app/actions/bank-transactions";
import CSVImportDialog from "./CSVImportDialog";
import StatusBadge, { type StatusKind } from "@/components/ui/StatusBadge";
import MetadataChip from "@/components/ui/MetadataChip";

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_last_four: string | null;
  account_type: string | null;
  notes: string | null;
}

interface Summary {
  total: number;
  matched: number;
  unmatched: number;
  ignored: number;
}

interface Props {
  account: BankAccount;
  initialTransactions: BankTransactionRow[];
  initialSummary: Summary;
}

const CATEGORY_LABELS: Record<string, string> = {
  check: "Check",
  loan_advance: "Loan Advance",
  interest_payment: "Interest Pmt",
  ach_payment: "ACH / Payment",
  wire: "Wire",
  deposit: "Deposit",
  other: "Other",
};

const STATUS_KIND: Record<string, StatusKind> = {
  matched: "complete",
  unmatched: "warning",
  ignored: "planned",
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  money_market: "Money Market",
  line_of_credit: "Line of Credit",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BankAccountDetailClient({
  account,
  initialTransactions,
  initialSummary,
}: Props) {
  const [transactions, setTransactions] = useState<BankTransactionRow[]>(initialTransactions);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [showImport, setShowImport] = useState(false);
  const [isPending, startTransition] = useTransition();

  function refreshTransactions(status?: string, category?: string) {
    startTransition(async () => {
      const res = await getBankTransactions(account.id, {
        matchStatus: status || undefined,
        category: category || undefined,
      });
      if (!res.error) {
        setTransactions(res.transactions);
      }
      // Refresh summary from full dataset
      const all = await getBankTransactions(account.id);
      if (!all.error) {
        const rows = all.transactions;
        setSummary({
          total: rows.length,
          matched: rows.filter((r) => r.match_status === "matched").length,
          unmatched: rows.filter((r) => r.match_status === "unmatched").length,
          ignored: rows.filter((r) => r.match_status === "ignored").length,
        });
      }
    });
  }

  function handleFilterStatus(status: string) {
    setFilterStatus(status);
    refreshTransactions(status, filterCategory);
  }

  function handleFilterCategory(category: string) {
    setFilterCategory(category);
    refreshTransactions(filterStatus, category);
  }

  function handleUnmatch(txnId: string) {
    startTransition(async () => {
      await unmatchTransaction(txnId);
      refreshTransactions(filterStatus, filterCategory);
    });
  }

  function handleIgnore(txnId: string) {
    startTransition(async () => {
      await ignoreTransaction(txnId);
      refreshTransactions(filterStatus, filterCategory);
    });
  }

  function handleImportSuccess() {
    setShowImport(false);
    refreshTransactions(filterStatus, filterCategory);
  }

  // Compute totals for visible transactions
  const totalDebits = transactions.reduce((s, t) => s + t.debit, 0);
  const totalCredits = transactions.reduce((s, t) => s + t.credit, 0);
  const latestBalance = transactions.length > 0 ? transactions[0].balance : null;

  return (
    <div className="space-y-4">
      {/* Account info bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <Building2 size={20} className="text-gray-400 flex-shrink-0" />
          <div>
            <p className="text-sm text-gray-500">
              {ACCOUNT_TYPE_LABELS[account.account_type ?? ""] ?? account.account_type} · ••••{account.account_last_four}
            </p>
            {account.notes && (
              <p className="text-xs text-gray-400 mt-0.5">{account.notes}</p>
            )}
          </div>
        </div>
        {latestBalance != null && (
          <div className="text-right">
            <p className="text-xs text-gray-500">Latest Balance</p>
            <p className="text-lg font-semibold text-gray-900">${fmt(latestBalance)}</p>
          </div>
        )}
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] transition-colors"
        >
          <Upload size={14} />
          Import CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard label="Transactions" value={summary.total.toString()} color="text-gray-900" />
        <SummaryCard label="Matched" value={summary.matched.toString()} color="text-green-600" />
        <SummaryCard label="Unmatched" value={summary.unmatched.toString()} color="text-amber-600" />
        <SummaryCard label="Total Out" value={`$${fmt(totalDebits)}`} color="text-red-600" />
        <SummaryCard label="Total In" value={`$${fmt(totalCredits)}`} color="text-green-600" />
      </div>

      {/* Filters */}
      {summary.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            value={filterStatus}
            onChange={(e) => handleFilterStatus(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="">All Statuses</option>
            <option value="unmatched">Unmatched</option>
            <option value="matched">Matched</option>
            <option value="ignored">Ignored</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => handleFilterCategory(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {(filterStatus || filterCategory) && (
            <button
              onClick={() => { setFilterStatus(""); setFilterCategory(""); refreshTransactions("", ""); }}
              className="text-xs text-[#4272EF] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Empty state (shared) */}
      {transactions.length === 0 ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-400 mb-3">
            {summary.total === 0
              ? "No transactions yet. Import a bank statement CSV to get started."
              : "No transactions match the current filters."}
          </p>
          {summary.total === 0 && (
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-[#4272EF] border border-dashed border-[#4272EF] rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Upload size={16} />
              Import CSV
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: card stack */}
          <div className="md:hidden space-y-2">
            {transactions.map((txn) => {
              const isDebit = txn.debit > 0;
              const amount = isDebit ? txn.debit : txn.credit;
              const statusColor =
                txn.match_status === "matched"
                  ? "var(--status-complete)"
                  : txn.match_status === "ignored"
                  ? "var(--status-planned)"
                  : "var(--status-warning)";
              return (
                <div
                  key={txn.id}
                  className={`bg-white rounded-xl border border-gray-200 p-3.5 ${
                    txn.match_status === "ignored" ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                      style={{ backgroundColor: statusColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate" title={txn.description}>
                        {txn.description}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>
                          {new Date(txn.transaction_date + "T00:00:00").toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {txn.check_ref && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="font-mono">{txn.check_ref}</span>
                          </>
                        )}
                        <span className="text-gray-300">·</span>
                        <MetadataChip>
                          {CATEGORY_LABELS[txn.category ?? ""] ?? txn.category}
                        </MetadataChip>
                      </p>
                      {txn.matched_invoice && (
                        <p className="text-[10px] text-[#4272EF] mt-1 truncate">
                          {txn.matched_invoice.vendor ?? "Invoice"} #{txn.matched_invoice.invoice_number}
                        </p>
                      )}
                      {!txn.matched_invoice && txn.notes && (
                        <p className="text-[10px] text-gray-400 mt-1 truncate" title={txn.notes}>
                          {txn.notes}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: isDebit ? "#dc2626" : "#16a34a" }}
                      >
                        {isDebit ? "-" : "+"}${fmt(amount)}
                      </div>
                      {txn.balance != null && (
                        <div className="text-[10px] text-gray-400 tabular-nums mt-0.5">
                          Bal ${fmt(txn.balance)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-100">
                    <StatusBadge status={STATUS_KIND[txn.match_status] ?? "neutral"} size="sm" className="flex-shrink-0">
                      {txn.match_status}
                    </StatusBadge>
                    <span className="flex-1" />
                    {txn.match_status === "matched" && (
                      <button
                        onClick={() => handleUnmatch(txn.id)}
                        disabled={isPending}
                        className="px-2.5 py-1.5 text-xs text-amber-600 border border-amber-200 rounded-md inline-flex items-center gap-1 min-h-[36px]"
                        title="Unmatch"
                      >
                        <Unlink size={12} />
                        Unmatch
                      </button>
                    )}
                    {txn.match_status === "unmatched" && (
                      <button
                        onClick={() => handleIgnore(txn.id)}
                        disabled={isPending}
                        className="px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-md inline-flex items-center gap-1 min-h-[36px]"
                        title="Ignore"
                      >
                        <EyeOff size={12} />
                        Ignore
                      </button>
                    )}
                    {txn.match_status === "ignored" && (
                      <button
                        onClick={() => handleUnmatch(txn.id)}
                        disabled={isPending}
                        className="px-2.5 py-1.5 text-xs text-amber-600 border border-amber-200 rounded-md inline-flex items-center gap-1 min-h-[36px]"
                        title="Restore"
                      >
                        <Eye size={12} />
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: transaction table */}
          <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-lg bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5">Ref</th>
                  <th className="px-3 py-2.5 text-right">Debit (Out)</th>
                  <th className="px-3 py-2.5 text-right">Credit (In)</th>
                  <th className="px-3 py-2.5 text-right">Balance</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Match Info</th>
                  <th className="px-3 py-2.5 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((txn) => (
                  <tr
                    key={txn.id}
                    className={`hover:bg-gray-50 transition-colors ${txn.match_status === "ignored" ? "opacity-40" : ""}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">
                      {new Date(txn.transaction_date + "T00:00:00").toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-900 max-w-[280px]">
                      <span className="block truncate" title={txn.description}>
                        {txn.description}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap font-mono">
                      {txn.check_ref || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-right whitespace-nowrap font-mono text-red-600">
                      {txn.debit > 0 ? `$${fmt(txn.debit)}` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-right whitespace-nowrap font-mono text-green-600">
                      {txn.credit > 0 ? `$${fmt(txn.credit)}` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-right whitespace-nowrap font-mono text-gray-600">
                      {txn.balance != null ? `$${fmt(txn.balance)}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <MetadataChip>
                        {CATEGORY_LABELS[txn.category ?? ""] ?? txn.category}
                      </MetadataChip>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={STATUS_KIND[txn.match_status] ?? "neutral"} size="sm">
                        {txn.match_status}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px]">
                      {txn.matched_invoice ? (
                        <span className="text-[#4272EF] truncate block" title={`${txn.matched_invoice.vendor} #${txn.matched_invoice.invoice_number}`}>
                          {txn.matched_invoice.vendor ?? "Invoice"} #{txn.matched_invoice.invoice_number}
                        </span>
                      ) : txn.notes ? (
                        <span className="truncate block" title={txn.notes}>{txn.notes}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center gap-0.5 justify-end">
                        {txn.match_status === "matched" && (
                          <button
                            onClick={() => handleUnmatch(txn.id)}
                            disabled={isPending}
                            className="p-1 text-gray-400 hover:text-amber-600 rounded transition-colors"
                            title="Unmatch"
                          >
                            <Unlink size={13} />
                          </button>
                        )}
                        {txn.match_status === "unmatched" && (
                          <button
                            onClick={() => handleIgnore(txn.id)}
                            disabled={isPending}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                            title="Ignore"
                          >
                            <EyeOff size={13} />
                          </button>
                        )}
                        {txn.match_status === "ignored" && (
                          <button
                            onClick={() => handleUnmatch(txn.id)}
                            disabled={isPending}
                            className="p-1 text-gray-400 hover:text-amber-600 rounded transition-colors"
                            title="Restore"
                          >
                            <Eye size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Import dialog */}
      {showImport && (
        <CSVImportDialog
          bankAccountId={account.id}
          accountName={`${account.bank_name} — ${account.account_name}`}
          onClose={() => setShowImport(false)}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
