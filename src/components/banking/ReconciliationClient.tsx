"use client";

import { useState, useTransition, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Link2,
  Unlink,
  Filter,
  ArrowUpDown,
} from "lucide-react";
import {
  getBankTransactions,
  unmatchTransaction,
  ignoreTransaction,
  type BankTransactionRow,
} from "@/app/actions/bank-transactions";

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_last_four: string | null;
}

interface Summary {
  total: number;
  matched: number;
  unmatched: number;
  ignored: number;
}

interface Props {
  accounts: BankAccount[];
  initialAccountId: string | null;
  initialTransactions: BankTransactionRow[];
  initialSummary: Summary;
}

const CATEGORY_LABELS: Record<string, string> = {
  check: "Check",
  loan_advance: "Loan Advance",
  interest_payment: "Interest Payment",
  ach_payment: "ACH / Payment",
  wire: "Wire",
  deposit: "Deposit",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  matched: "bg-green-100 text-green-700",
  unmatched: "bg-amber-100 text-amber-700",
  ignored: "bg-gray-100 text-gray-500",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReconciliationClient({
  accounts,
  initialAccountId,
  initialTransactions,
  initialSummary,
}: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId ?? accounts[0]?.id ?? "");
  const [transactions, setTransactions] = useState<BankTransactionRow[]>(initialTransactions);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const refreshTransactions = useCallback(
    (accountId: string, status?: string, category?: string) => {
      startTransition(async () => {
        const res = await getBankTransactions(accountId, {
          matchStatus: status || undefined,
          category: category || undefined,
        });
        if (!res.error) {
          setTransactions(res.transactions);
          // Recalculate summary from full dataset
          const all = await getBankTransactions(accountId);
          if (!all.error) {
            const rows = all.transactions;
            setSummary({
              total: rows.length,
              matched: rows.filter((r) => r.match_status === "matched").length,
              unmatched: rows.filter((r) => r.match_status === "unmatched").length,
              ignored: rows.filter((r) => r.match_status === "ignored").length,
            });
          }
        }
      });
    },
    []
  );

  function handleAccountChange(accountId: string) {
    setSelectedAccountId(accountId);
    refreshTransactions(accountId, filterStatus, filterCategory);
  }

  function handleFilterStatus(status: string) {
    setFilterStatus(status);
    refreshTransactions(selectedAccountId, status, filterCategory);
  }

  function handleFilterCategory(category: string) {
    setFilterCategory(category);
    refreshTransactions(selectedAccountId, filterStatus, category);
  }

  function handleUnmatch(txnId: string) {
    startTransition(async () => {
      const res = await unmatchTransaction(txnId);
      if (!res.error) {
        refreshTransactions(selectedAccountId, filterStatus, filterCategory);
      }
    });
  }

  function handleIgnore(txnId: string) {
    startTransition(async () => {
      const res = await ignoreTransaction(txnId);
      if (!res.error) {
        refreshTransactions(selectedAccountId, filterStatus, filterCategory);
      }
    });
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const categories = [...new Set(transactions.map((t) => t.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-4">
      {/* Account selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <select
          value={selectedAccountId}
          onChange={(e) => handleAccountChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.bank_name} — {a.account_name} (••••{a.account_last_four})
            </option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total" value={summary.total} color="text-gray-900" />
        <SummaryCard label="Matched" value={summary.matched} color="text-green-600" />
        <SummaryCard label="Unmatched" value={summary.unmatched} color="text-amber-600" />
        <SummaryCard label="Ignored" value={summary.ignored} color="text-gray-400" />
      </div>

      {/* Filters */}
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
      </div>

      {/* Transaction table */}
      {transactions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-400">
            {summary.total === 0
              ? "No transactions imported yet. Go to Bank Accounts to import a CSV."
              : "No transactions match the current filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Match</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((txn) => (
                <tr
                  key={txn.id}
                  className={`hover:bg-gray-50 ${txn.match_status === "ignored" ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">
                    {new Date(txn.transaction_date + "T00:00:00").toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-900 max-w-[250px] truncate" title={txn.description}>
                    {txn.description}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                    {txn.check_ref || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-right whitespace-nowrap text-red-600">
                    {txn.debit > 0 ? `$${fmt(txn.debit)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-right whitespace-nowrap text-green-600">
                    {txn.credit > 0 ? `$${fmt(txn.credit)}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-right whitespace-nowrap text-gray-600">
                    {txn.balance != null ? `$${fmt(txn.balance)}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-500">
                      {CATEGORY_LABELS[txn.category ?? ""] ?? txn.category}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[txn.match_status] ?? ""}`}>
                      {txn.match_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate" title={txn.notes ?? ""}>
                    {txn.matched_invoice ? (
                      <span className="text-[#4272EF]">
                        {txn.matched_invoice.vendor ?? "Invoice"} #{txn.matched_invoice.invoice_number}
                      </span>
                    ) : txn.notes ? (
                      txn.notes
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="flex items-center gap-1 justify-end">
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
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
