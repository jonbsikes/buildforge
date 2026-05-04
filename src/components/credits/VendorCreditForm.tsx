"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createVendorCredit } from "@/app/actions/vendor-credits";
import { AlertTriangle } from "lucide-react";

interface Vendor { id: string; name: string }
interface Project { id: string; name: string; project_type: "home_construction" | "land_development" }
interface CostCode {
  id: string;
  code: string;
  name: string;
  project_type: "home_construction" | "land_development" | "general_admin" | null;
}

interface Props {
  vendors: Vendor[];
  projects: Project[];
  costCodes: CostCode[];
  defaultVendorId?: string | null;
}

export default function VendorCreditForm({ vendors, projects, costCodes, defaultVendorId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const [vendorId, setVendorId] = useState(defaultVendorId ?? "");
  const [projectId, setProjectId] = useState("");
  const [costCode, setCostCode] = useState("");
  const [creditDate, setCreditDate] = useState(today);
  const [creditNumber, setCreditNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const projectType = useMemo<"home_construction" | "land_development" | null>(() => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.project_type ?? null;
  }, [projectId, projects]);

  const filteredCostCodes = useMemo(() => {
    const targetType = projectType ?? "general_admin";
    return costCodes.filter((c) => c.project_type === targetType);
  }, [costCodes, projectType]);

  const debitAccountLabel = useMemo(() => {
    if (!projectId) return "G&A Expense (6900)";
    if (projectType === "land_development") return "CIP — Land Improvements (1230)";
    return "Construction WIP (1210)";
  }, [projectId, projectType]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNum = parseFloat(amount);
    if (!vendorId) { setError("Vendor is required"); return; }
    if (!amountNum || amountNum <= 0) { setError("Credit amount must be greater than zero"); return; }
    if (!creditDate) { setError("Credit date is required"); return; }

    startTransition(async () => {
      const r = await createVendorCredit({
        vendor_id: vendorId,
        project_id: projectId || null,
        cost_code: costCode || null,
        credit_date: creditDate,
        credit_number: creditNumber.trim() || null,
        original_invoice_id: null,
        amount: amountNum,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
      });
      if (r.error) { setError(r.error); return; }
      router.push("/invoices/credits");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Vendor *</label>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            required
          >
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Credit date *</label>
            <input
              type="date"
              value={creditDate}
              onChange={(e) => setCreditDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Credit memo # (optional)</label>
            <input
              type="text"
              value={creditNumber}
              onChange={(e) => setCreditNumber(e.target.value)}
              placeholder="Vendor's credit / RMA #"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] tabular-nums"
              required
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Enter as a positive number. The credit reduces what you owe this vendor.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-gray-500">Cost reversal</p>
        <p className="text-[11px] text-gray-500 -mt-3">
          The credit reverses cost from the project (or G&A). Pick the project this credit relates to,
          or leave blank for company-wide.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setCostCode(""); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            >
              <option value="">G&A (no project)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cost code (optional)</label>
            <select
              value={costCode}
              onChange={(e) => setCostCode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            >
              <option value="">— None —</option>
              {filteredCostCodes.map((c) => (
                <option key={c.id} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-[11px] text-gray-600">
          <strong>Posts:</strong> DR Accounts Payable (2000) <span className="tabular-nums">${amount || "0.00"}</span> /
          CR {debitAccountLabel} <span className="tabular-nums">${amount || "0.00"}</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Returned materials, billing correction, rebate"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save Credit"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/invoices/credits")}
          className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
