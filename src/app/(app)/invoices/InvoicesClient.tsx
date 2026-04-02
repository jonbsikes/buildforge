// @ts-nocheck
"use client";

import { useState, useMemo, useTransition } from "react";
import { FileText, Plus, Trash2, CheckCircle2, Clock, AlertCircle, CreditCard, XCircle, Bot } from "lucide-react";
import { createInvoice, updateInvoiceStatus, deleteInvoice } from "./actions";
import type { Database } from "@/types/database";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type ProjectRef = { id: string; name: string };
type VendorRef = { id: string; name: string };

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending_review: {
    label: "Pending Review",
    color: "bg-amber-50 text-amber-700",
    icon: <Clock size={11} />,
  },
  approved: {
    label: "Approved",
    color: "bg-blue-50 text-blue-700",
    icon: <CheckCircle2 size={11} />,
  },
  scheduled: {
    label: "Scheduled",
    color: "bg-purple-50 text-purple-700",
    icon: <CreditCard size={11} />,
  },
  paid: {
    label: "Paid",
    color: "bg-green-50 text-green-700",
    icon: <CheckCircle2 size={11} />,
  },
  disputed: {
    label: "Disputed",
    color: "bg-red-50 text-red-700",
    icon: <XCircle size={11} />,
  },
};

const WORKFLOW_NEXT: Record<string, { action: string; next: string }> = {
  pending_review: { action: "Approve", next: "approved" },
  approved: { action: "Schedule", next: "scheduled" },
  scheduled: { action: "Mark Paid", next: "paid" },
};

const PAYMENT_METHODS = ["check", "ach", "wire", "credit_card"] as const;

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

function NewInvoiceForm({
  projects,
  vendors,
  onDone,
}: {
  projects: ProjectRef[];
  vendors: VendorRef[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await createInvoice(fd);
          onDone();
        });
      }}
      className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">New Invoice</h3>
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Bot size={12} /> AI processing placeholder — email ingestion coming soon
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          name="project_id"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">Select project *</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          name="vendor_id"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">Select vendor (optional)</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <input
          name="invoice_number"
          placeholder="Invoice number"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <input
          name="file_name"
          required
          placeholder="Description / file name *"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <div>
          <label className="block text-xs text-gray-500 mb-1">Invoice Date</label>
          <input
            name="invoice_date"
            type="date"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Due Date</label>
          <input
            name="due_date"
            type="date"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>
        <input
          name="total_amount"
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount ($)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <select
          name="payment_method"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">Payment method</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m.replace("_", " ").toUpperCase()}</option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "#4272EF" }}
        >
          {isPending ? "Saving..." : "Create Invoice"}
        </button>
      </div>
    </form>
  );
}

function MarkPaidForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await updateInvoiceStatus(invoice.id, "paid", {
            payment_date: fd.get("payment_date") as string,
            payment_method: fd.get("payment_method") as string,
          });
          onDone();
        });
      }}
      className="flex flex-wrap items-center gap-2 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100"
    >
      <input
        name="payment_date"
        type="date"
        required
        defaultValue={new Date().toISOString().split("T")[0]}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
      />
      <select
        name="payment_method"
        required
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
      >
        {PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>{m.replace("_", " ").toUpperCase()}</option>
        ))}
      </select>
      <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white rounded-lg" style={{ backgroundColor: "#4272EF" }}>
        {isPending ? "..." : "Confirm"}
      </button>
      <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
    </form>
  );
}

export default function InvoicesClient({
  invoices,
  projects,
  vendors,
}: {
  invoices: Invoice[];
  projects: ProjectRef[];
  vendors: VendorRef[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (filterProject && inv.project_id !== filterProject) return false;
      if (filterStatus && inv.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !inv.file_name.toLowerCase().includes(q) &&
          !(inv.vendor ?? "").toLowerCase().includes(q) &&
          !(inv.invoice_number ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [invoices, filterProject, filterStatus, search]);

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const pendingCount = invoices.filter((i) => i.status === "pending_review").length;
  const approvedCount = invoices.filter((i) => i.status === "approved").length;
  const totalUnpaid = invoices
    .filter((i) => i.status !== "paid" && i.status !== "disputed")
    .reduce((s, i) => s + (i.total_amount ?? 0), 0);

  const today = new Date().toISOString().split("T")[0];
  const pastDueCount = invoices.filter(
    (i) => i.status !== "paid" && i.due_date && i.due_date < today
  ).length;

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className={`rounded-xl border p-4 ${pendingCount > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
          <p className={`text-xs ${pendingCount > 0 ? "text-amber-700" : "text-gray-500"}`}>Pending Review</p>
          <p className={`text-2xl font-bold mt-1 ${pendingCount > 0 ? "text-amber-700" : "text-gray-900"}`}>{pendingCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Approved</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{approvedCount}</p>
        </div>
        <div className={`rounded-xl border p-4 ${pastDueCount > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
          <p className={`text-xs ${pastDueCount > 0 ? "text-red-700" : "text-gray-500"}`}>Past Due</p>
          <p className={`text-2xl font-bold mt-1 ${pastDueCount > 0 ? "text-red-700" : "text-gray-900"}`}>{pastDueCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Outstanding</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totalUnpaid)}</p>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] w-48"
        />
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {(filterProject || filterStatus || search) && (
          <button onClick={() => { setFilterProject(""); setFilterStatus(""); setSearch(""); }} className="text-sm text-gray-400 hover:text-gray-600 underline">
            Clear
          </button>
        )}
        <button
          onClick={() => setShowAdd(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
          style={{ backgroundColor: "#4272EF" }}
        >
          <Plus size={15} /> New Invoice
        </button>
      </div>

      {showAdd && <NewInvoiceForm projects={projects} vendors={vendors} onDone={() => setShowAdd(false)} />}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <FileText size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {invoices.length === 0 ? "No invoices yet." : "No invoices match the current filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Invoice</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Due</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((inv) => {
                const status = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending_review;
                const isPastDue = inv.status !== "paid" && inv.due_date && inv.due_date < today;
                const nextAction = WORKFLOW_NEXT[inv.status];
                const isLowConfidence = inv.ai_confidence === "low" && inv.status === "pending_review";

                return (
                  <>
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-gray-400 shrink-0" />
                          <div>
                            <span className="text-gray-900 font-medium truncate max-w-[160px] block">{inv.file_name}</span>
                            {inv.invoice_number && (
                              <span className="text-xs text-gray-400">#{inv.invoice_number}</span>
                            )}
                          </div>
                        </div>
                        {isLowConfidence && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 mt-0.5">
                            <AlertCircle size={11} /> Low confidence — review required
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/projects/${inv.project_id}`} className="text-xs hover:underline" style={{ color: "#4272EF" }}>
                          {projectMap[inv.project_id] ?? "—"}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{inv.vendor ?? <span className="text-gray-300">—</span>}</td>
                      <td className={`px-4 py-3 text-xs ${isPastDue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                        {inv.due_date ?? <span className="text-gray-300">—</span>}
                        {isPastDue && " ⚠"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(inv.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                          {status.icon} {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {nextAction && !isLowConfidence && inv.status !== "paid" && (
                          nextAction.next === "paid" ? (
                            <button
                              onClick={() => setMarkingPaidId(markingPaidId === inv.id ? null : inv.id)}
                              className="text-xs text-white px-2 py-1 rounded-lg"
                              style={{ backgroundColor: "#4272EF" }}
                            >
                              {nextAction.action}
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                startTransition(async () => {
                                  await updateInvoiceStatus(inv.id, nextAction.next);
                                })
                              }
                              className="text-xs text-white px-2 py-1 rounded-lg"
                              style={{ backgroundColor: "#4272EF" }}
                            >
                              {nextAction.action}
                            </button>
                          )
                        )}
                        {inv.status === "approved" && (
                          <button
                            onClick={() =>
                              startTransition(async () => {
                                await updateInvoiceStatus(inv.id, "disputed");
                              })
                            }
                            className="ml-1 text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg border border-gray-200"
                          >
                            Dispute
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <button
                          onClick={() =>
                            startTransition(async () => {
                              if (confirm("Delete this invoice?")) await deleteInvoice(inv.id);
                            })
                          }
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                    {markingPaidId === inv.id && (
                      <tr key={`${inv.id}-paid`}>
                        <td colSpan={8} className="px-4 pb-3">
                          <MarkPaidForm invoice={inv} onDone={() => setMarkingPaidId(null)} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
