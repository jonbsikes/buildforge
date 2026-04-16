"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Plus, X, Check, Building2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  type BankAccountInput,
} from "@/app/actions/banking";
import CSVImportDialog from "./CSVImportDialog";

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_last_four: string | null;
  account_type: string | null;
  notes: string | null;
}

interface Props {
  initialAccounts: BankAccount[];
}

const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "money_market", label: "Money Market" },
  { value: "line_of_credit", label: "Line of Credit" },
];

const EMPTY: BankAccountInput = {
  bank_name: "",
  account_name: "",
  account_last_four: "",
  account_type: "checking",
  notes: "",
};

function ic(err = false) {
  return `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] focus:border-transparent ${err ? "border-red-400" : "border-gray-300"}`;
}

function getAccountTypeBadgeClasses(type: string | null) {
  switch (type) {
    case "checking":
      return "bg-blue-100 text-blue-700";
    case "savings":
      return "bg-green-100 text-green-700";
    case "money_market":
      return "bg-purple-100 text-purple-700";
    case "line_of_credit":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function AccountForm({
  initial,
  onSave,
  onCancel,
  isPending,
  error,
}: {
  initial: BankAccountInput;
  onSave: (data: BankAccountInput) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const [f, setF] = useState<BankAccountInput>(initial);
  const s = (k: keyof BankAccountInput, v: string) => setF((p) => ({ ...p, [k]: v }));

  const [errs, setErrs] = useState<Partial<Record<keyof BankAccountInput, string>>>({});

  function validate() {
    const e: Partial<Record<keyof BankAccountInput, string>> = {};
    if (!f.bank_name.trim()) e.bank_name = "Required";
    if (!f.account_name.trim()) e.account_name = "Required";
    if (!f.account_last_four.trim()) e.account_last_four = "Required";
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (validate()) onSave(f);
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bank Name *</label>
          <input type="text" value={f.bank_name} onChange={(e) => s("bank_name", e.target.value)} className={ic(!!errs.bank_name)} placeholder="e.g. First National Bank" />
          {errs.bank_name && <p className="text-xs text-red-500 mt-0.5">{errs.bank_name}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Name *</label>
          <input type="text" value={f.account_name} onChange={(e) => s("account_name", e.target.value)} className={ic(!!errs.account_name)} placeholder="e.g. Prairie Sky Operating" />
          {errs.account_name && <p className="text-xs text-red-500 mt-0.5">{errs.account_name}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Last 4 Digits *</label>
          <input
            type="text"
            maxLength={4}
            value={f.account_last_four}
            onChange={(e) => s("account_last_four", e.target.value.replace(/\D/g, "").slice(-4))}
            className={ic(!!errs.account_last_four)}
            placeholder="1234"
          />
          {errs.account_last_four && <p className="text-xs text-red-500 mt-0.5">{errs.account_last_four}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Type</label>
          <select value={f.account_type} onChange={(e) => s("account_type", e.target.value)} className={ic()}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <input type="text" value={f.notes} onChange={(e) => s("notes", e.target.value)} className={ic()} placeholder="Optional notes" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2 justify-end">
        <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors">
          <X size={16} />
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] disabled:opacity-60 transition-colors"
        >
          <Check size={14} />
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function BankAccountsClient({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importingAccount, setImportingAccount] = useState<BankAccount | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleCreate(data: BankAccountInput) {
    setError(null);
    startTransition(async () => {
      const result = await createBankAccount(data);
      if (result.error) {
        setError(result.error);
      } else {
        setAccounts((prev) => [
          ...prev,
          { id: result.id!, ...data, notes: data.notes || null },
        ]);
        setShowAdd(false);
      }
    });
  }

  function handleUpdate(id: string, data: BankAccountInput) {
    setError(null);
    startTransition(async () => {
      const result = await updateBankAccount(id, data);
      if (result.error) {
        setError(result.error);
      } else {
        setAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, ...data, notes: data.notes || null } : a))
        );
        setEditingId(null);
      }
    });
  }

  function handleDelete(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteBankAccount(id);
      if (result.error) {
        setError(result.error);
      } else {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>
      )}

      {accounts.length === 0 && !showAdd && (
        <div className="text-center py-12">
          <p className="text-sm text-gray-400 mb-4">No bank accounts yet. Add one to get started.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-[#4272EF] border border-dashed border-[#4272EF] rounded-lg hover:bg-blue-50 transition-colors"
          >
            <Plus size={16} />
            Add Bank Account
          </button>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accounts.map((acct) =>
            editingId === acct.id ? (
              <div key={acct.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <AccountForm
                  initial={{ bank_name: acct.bank_name, account_name: acct.account_name, account_last_four: acct.account_last_four ?? "", account_type: acct.account_type ?? "", notes: acct.notes ?? "" }}
                  onSave={(data) => handleUpdate(acct.id, data)}
                  onCancel={() => setEditingId(null)}
                  isPending={isPending}
                  error={error}
                />
              </div>
            ) : deletingId === acct.id ? (
              <div key={acct.id} className="bg-red-50 border border-red-200 rounded-lg p-4 shadow-sm">
                <div className="space-y-3">
                  <p className="text-sm text-red-700">
                    Delete <strong>{acct.account_name}</strong> (••••{acct.account_last_four})?
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setDeletingId(null)}
                      className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-300 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(acct.id)}
                      disabled={isPending}
                      className="text-xs text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg disabled:opacity-60 transition-colors"
                    >
                      {isPending ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={acct.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/banking/accounts/${acct.id}`)}>
                <div className="flex items-start gap-3 mb-3">
                  <Building2 size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900">{acct.bank_name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {acct.account_name} · ••••{acct.account_last_four}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getAccountTypeBadgeClasses(acct.account_type)}`}>
                    {ACCOUNT_TYPES.find((t) => t.value === acct.account_type)?.label ?? acct.account_type}
                  </span>
                </div>

                {acct.notes && (
                  <p className="text-xs text-gray-600 mb-3">
                    {acct.notes}
                  </p>
                )}

                <div className="flex items-center gap-2 justify-end pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setImportingAccount(acct)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-[#4272EF] hover:bg-blue-50 rounded transition-colors"
                    title="Import CSV"
                  >
                    <Upload size={13} />
                    Import
                  </button>
                  <button
                    onClick={() => setEditingId(acct.id)}
                    className="p-1.5 text-gray-400 hover:text-[#4272EF] hover:bg-blue-50 rounded transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeletingId(acct.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {showAdd ? (
        <AccountForm
          initial={EMPTY}
          onSave={handleCreate}
          onCancel={() => setShowAdd(false)}
          isPending={isPending}
          error={error}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm text-[#4272EF] border border-[#4272EF]/30 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Plus size={15} />
          Add Bank Account
        </button>
      )}

      {importingAccount && (
        <CSVImportDialog
          bankAccountId={importingAccount.id}
          accountName={`${importingAccount.bank_name} — ${importingAccount.account_name}`}
          onClose={() => setImportingAccount(null)}
          onSuccess={() => setImportingAccount(null)}
        />
      )}
    </div>
  );
}
