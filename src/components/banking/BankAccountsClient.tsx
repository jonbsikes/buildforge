"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";
import {
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  type BankAccountInput,
} from "@/app/actions/banking";

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_last_four: string;
  account_type: string;
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
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
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
      <div className="grid grid-cols-2 gap-4">
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
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-100">
          <X size={14} />
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-[#4272EF] text-white rounded-lg hover:bg-[#3461de] disabled:opacity-60"
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center text-sm text-gray-400">
          No bank accounts yet. Add one to get started.
        </div>
      )}

      {accounts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {["Bank", "Account Name", "Account #", "Type", "Notes", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {accounts.map((acct) =>
                editingId === acct.id ? (
                  <tr key={acct.id}>
                    <td colSpan={6} className="p-4">
                      <AccountForm
                        initial={{ bank_name: acct.bank_name, account_name: acct.account_name, account_last_four: acct.account_last_four, account_type: acct.account_type, notes: acct.notes ?? "" }}
                        onSave={(data) => handleUpdate(acct.id, data)}
                        onCancel={() => setEditingId(null)}
                        isPending={isPending}
                        error={error}
                      />
                    </td>
                  </tr>
                ) : deletingId === acct.id ? (
                  <tr key={acct.id} className="bg-red-50">
                    <td colSpan={5} className="px-4 py-3 text-sm text-red-700">
                      Delete <strong>{acct.account_name}</strong> (••••{acct.account_last_four})?
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setDeletingId(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-300 rounded">Cancel</button>
                        <button onClick={() => handleDelete(acct.id)} disabled={isPending} className="text-xs text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded disabled:opacity-60">
                          {isPending ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={acct.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{acct.bank_name}</td>
                    <td className="px-4 py-3 text-gray-700">{acct.account_name}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono">••••{acct.account_last_four}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                        {ACCOUNT_TYPES.find((t) => t.value === acct.account_type)?.label ?? acct.account_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{acct.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setEditingId(acct.id)} className="p-1.5 text-gray-400 hover:text-[#4272EF] hover:bg-blue-50 rounded transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setDeletingId(acct.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          </div>
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
    </div>
  );
}
