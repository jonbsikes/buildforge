"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  createPayment,
  clearPayment,
  voidPayment,
  type PaymentRow,
  type CreatePaymentInput,
} from "@/app/actions/payments";
import {
  Plus,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  CreditCard,
  Banknote,
  ArrowRightLeft,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayableInvoice {
  id: string;
  vendor: string | null;
  vendor_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number;
  project_name: string | null;
  project_id: string | null;
  cost_code: string | null;
}

interface Props {
  initialPayments: PaymentRow[];
  payableInvoices: PayableInvoice[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined) {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "\u2014";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_COLORS: Record<string, string> = {
  outstanding: "bg-amber-100 text-amber-700",
  cleared: "bg-green-100 text-green-700",
  void: "bg-red-100 text-red-600",
};

const METHOD_ICONS: Record<string, typeof CreditCard> = {
  check: Banknote,
  ach: ArrowRightLeft,
  wire: CreditCard,
  auto_draft: Zap,
};

const METHOD_LABELS: Record<string, string> = {
  check: "Check",
  ach: "ACH",
  wire: "Wire",
  auto_draft: "Auto-Draft",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PaymentRegisterClient({
  initialPayments,
  payableInvoices,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Expanded rows (show linked invoices)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // New payment form
  const [showNewPayment, setShowNewPayment] = useState(false);

  // Clear payment dialog
  const [clearingPaymentId, setClearingPaymentId] = useState<string | null>(null);
  const [clearDate, setClearDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return initialPayments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (methodFilter !== "all" && p.payment_method !== methodFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesPayee = p.payee.toLowerCase().includes(q);
        const matchesNumber = p.payment_number?.toLowerCase().includes(q);
        const matchesInvoice = p.invoices.some(
          (inv) =>
            inv.invoice_number?.toLowerCase().includes(q) ||
            inv.project_name?.toLowerCase().includes(q)
        );
        if (!matchesPayee && !matchesNumber && !matchesInvoice) return false;
      }
      return true;
    });
  }, [initialPayments, statusFilter, methodFilter, searchQuery]);

  // Summary totals
  const totals = useMemo(() => {
    const outstanding = initialPayments
      .filter((p) => p.status === "outstanding")
      .reduce((s, p) => s + p.amount, 0);
    const cleared = initialPayments
      .filter((p) => p.status === "cleared")
      .reduce((s, p) => s + p.amount, 0);
    return { outstanding, cleared, count: initialPayments.length };
  }, [initialPayments]);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleClear(paymentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await clearPayment(paymentId, clearDate);
      if (result.error) {
        setError(result.error);
      } else {
        setClearingPaymentId(null);
        router.refresh();
      }
    });
  }

  function handleVoid(paymentId: string) {
    if (!confirm("Void this payment? This will reverse all GL entries and revert linked invoices to Approved."))
      return;
    setError(null);
    startTransition(async () => {
      const result = await voidPayment(paymentId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total Payments
          </p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">
            {totals.count}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 px-5 py-4">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">
            Outstanding Checks
          </p>
          <p className="text-2xl font-semibold text-amber-700 mt-1">
            {fmt(totals.outstanding)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 px-5 py-4">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wide">
            Cleared
          </p>
          <p className="text-2xl font-semibold text-green-700 mt-1">
            {fmt(totals.cleared)}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search payee, check #, invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 focus:border-[#4272EF]"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
        >
          <option value="all">All Statuses</option>
          <option value="outstanding">Outstanding</option>
          <option value="cleared">Cleared</option>
          <option value="void">Void</option>
        </select>

        {/* Method filter */}
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
        >
          <option value="all">All Methods</option>
          <option value="check">Check</option>
          <option value="ach">ACH</option>
          <option value="wire">Wire</option>
          <option value="auto_draft">Auto-Draft</option>
        </select>

        <div className="flex-1" />

        {/* New Payment button */}
        <button
          onClick={() => setShowNewPayment(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
        >
          <Plus size={16} />
          New Payment
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline text-red-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Payment table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            {initialPayments.length === 0
              ? "No payments recorded yet."
              : "No payments match your filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="w-8 px-3 py-3" />
                  <th className="text-left px-3 py-3 font-medium text-gray-600">
                    #
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">
                    Method
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">
                    Payee
                  </th>
                  <th className="text-right px-3 py-3 font-medium text-gray-600">
                    Amount
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">
                    Date
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">
                    Cleared
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">
                    Status
                  </th>
                  <th className="text-left px-3 py-3 font-medium text-gray-600">
                    Source
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">
                    Invoices
                  </th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => {
                  const expanded = expandedRows.has(p.id);
                  const MethodIcon = METHOD_ICONS[p.payment_method] ?? Banknote;
                  return (
                    <PaymentTableRow
                      key={p.id}
                      payment={p}
                      expanded={expanded}
                      onToggle={() => toggleRow(p.id)}
                      onClear={() => setClearingPaymentId(p.id)}
                      onVoid={() => handleVoid(p.id)}
                      MethodIcon={MethodIcon}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Clear Payment Modal */}
      {clearingPaymentId && (
        <Modal onClose={() => setClearingPaymentId(null)}>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Mark Check as Cleared
          </h3>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cleared Date
          </label>
          <input
            type="date"
            value={clearDate}
            onChange={(e) => setClearDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
          />
          <p className="text-xs text-gray-500 mb-4">
            This will post: DR Checks Outstanding (2050) / CR Cash (1000)
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setClearingPaymentId(null)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => handleClear(clearingPaymentId)}
              disabled={isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Posting..." : "Mark Cleared"}
            </button>
          </div>
        </Modal>
      )}

      {/* New Payment Modal */}
      {showNewPayment && (
        <NewPaymentModal
          payableInvoices={payableInvoices}
          onClose={() => setShowNewPayment(false)}
          onCreated={() => {
            setShowNewPayment(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaymentTableRow
// ---------------------------------------------------------------------------

function PaymentTableRow({
  payment: p,
  expanded,
  onToggle,
  onClear,
  onVoid,
  MethodIcon,
}: {
  payment: PaymentRow;
  expanded: boolean;
  onToggle: () => void;
  onClear: () => void;
  onVoid: () => void;
  MethodIcon: typeof Banknote;
}) {
  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50/50 cursor-pointer ${
          p.status === "void" ? "opacity-50" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-3 py-3">
          {p.invoices.length > 0 && (
            expanded ? (
              <ChevronDown size={14} className="text-gray-400" />
            ) : (
              <ChevronRight size={14} className="text-gray-400" />
            )
          )}
        </td>
        <td className="px-3 py-3 font-mono text-gray-700">
          {p.payment_number || "\u2014"}
        </td>
        <td className="px-3 py-3">
          <span className="inline-flex items-center gap-1.5 text-gray-600">
            <MethodIcon size={14} />
            {METHOD_LABELS[p.payment_method] ?? p.payment_method}
          </span>
        </td>
        <td className="px-3 py-3 font-medium text-gray-900">{p.payee}</td>
        <td className="px-3 py-3 text-right font-mono text-gray-900">
          {fmt(p.amount)}
        </td>
        <td className="px-3 py-3 text-gray-600">{fmtDate(p.payment_date)}</td>
        <td className="px-3 py-3 text-gray-600">
          {fmtDate(p.cleared_date)}
        </td>
        <td className="px-3 py-3">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
              STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {p.status}
          </span>
        </td>
        <td className="px-3 py-3 text-xs text-gray-500 capitalize">
          {p.funding_source.replace("_", " ")}
        </td>
        <td className="px-3 py-3 text-center text-gray-500">
          {p.invoices.length}
        </td>
        <td className="px-3 py-3">
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {p.status === "outstanding" && (
              <button
                onClick={onClear}
                title="Mark Cleared"
                className="p-1.5 text-green-600 hover:bg-green-50 rounded-md transition-colors"
              >
                <Check size={14} />
              </button>
            )}
            {p.status !== "void" && (
              <button
                onClick={onVoid}
                title="Void Payment"
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {/* Expanded: linked invoices */}
      {expanded &&
        p.invoices.map((inv) => (
          <tr
            key={inv.id}
            className="bg-gray-50/70 border-b border-gray-100 text-xs"
          >
            <td />
            <td />
            <td />
            <td className="px-3 py-2 text-gray-600">
              {inv.project_name ?? "No project"}{" "}
              {inv.cost_code && (
                <span className="text-gray-400">/ Code {inv.cost_code}</span>
              )}
            </td>
            <td className="px-3 py-2 text-right font-mono text-gray-600">
              {fmt(inv.amount)}
            </td>
            <td className="px-3 py-2 text-gray-500 font-mono" colSpan={2}>
              Inv #{inv.invoice_number ?? "\u2014"}
            </td>
            <td colSpan={4} />
          </tr>
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal wrapper
// ---------------------------------------------------------------------------

function Modal({
  children,
  onClose,
  wide,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        className={`relative bg-white rounded-xl shadow-xl p-6 ${
          wide ? "max-w-3xl w-full mx-4" : "max-w-md w-full mx-4"
        } max-h-[90vh] overflow-y-auto`}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewPaymentModal
// Lets the user select invoices (grouped by vendor), pick payment method,
// enter a check number, and submit.
// ---------------------------------------------------------------------------

function NewPaymentModal({
  payableInvoices,
  onClose,
  onCreated,
}: {
  payableInvoices: PayableInvoice[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [method, setMethod] = useState<"check" | "ach" | "wire" | "auto_draft">("check");
  const [paymentNumber, setPaymentNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [fundingSource, setFundingSource] = useState<"bank_funded" | "owner_funded" | "dda">("dda");
  const [notes, setNotes] = useState("");

  // Invoice selection
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(
    new Set()
  );

  // Vendor filter for invoice list
  const [vendorFilter, setVendorFilter] = useState("");

  // Group invoices by vendor
  const vendors = useMemo(() => {
    const map = new Map<
      string,
      { vendor: string; vendor_id: string | null; invoices: PayableInvoice[] }
    >();
    for (const inv of payableInvoices) {
      const key = inv.vendor ?? "Unknown Vendor";
      if (!map.has(key)) {
        map.set(key, { vendor: key, vendor_id: inv.vendor_id, invoices: [] });
      }
      map.get(key)!.invoices.push(inv);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.vendor.localeCompare(b.vendor)
    );
  }, [payableInvoices]);

  const filteredVendors = useMemo(() => {
    if (!vendorFilter) return vendors;
    const q = vendorFilter.toLowerCase();
    return vendors.filter((v) => v.vendor.toLowerCase().includes(q));
  }, [vendors, vendorFilter]);

  // Selected totals
  const selectedTotal = useMemo(() => {
    return payableInvoices
      .filter((inv) => selectedInvoices.has(inv.id))
      .reduce((s, inv) => s + inv.amount, 0);
  }, [payableInvoices, selectedInvoices]);

  // Payee derived from selected invoices
  const payee = useMemo(() => {
    const vendorNames = new Set(
      payableInvoices
        .filter((inv) => selectedInvoices.has(inv.id))
        .map((inv) => inv.vendor ?? "Unknown")
    );
    return Array.from(vendorNames).join(" / ");
  }, [payableInvoices, selectedInvoices]);

  function toggleInvoice(id: string) {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVendorInvoices(vendorInvoices: PayableInvoice[]) {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      const allSelected = vendorInvoices.every((inv) => next.has(inv.id));
      if (allSelected) {
        vendorInvoices.forEach((inv) => next.delete(inv.id));
      } else {
        vendorInvoices.forEach((inv) => next.add(inv.id));
      }
      return next;
    });
  }

  function handleSubmit() {
    if (selectedInvoices.size === 0) {
      setError("Select at least one invoice");
      return;
    }
    if (!paymentDate) {
      setError("Payment date is required");
      return;
    }

    const invoiceInputs = payableInvoices
      .filter((inv) => selectedInvoices.has(inv.id))
      .map((inv) => ({
        invoice_id: inv.id,
        amount: inv.amount,
      }));

    // Determine vendor_id (only if all invoices are same vendor)
    const vendorIds = [
      ...new Set(
        payableInvoices
          .filter((inv) => selectedInvoices.has(inv.id))
          .map((inv) => inv.vendor_id)
          .filter(Boolean)
      ),
    ];

    const input: CreatePaymentInput = {
      payment_number: paymentNumber.trim() || null,
      payment_method: method,
      payee: payee || "Unknown",
      vendor_id: vendorIds.length === 1 ? vendorIds[0] : null,
      amount: Math.round(selectedTotal * 100) / 100,
      payment_date: paymentDate,
      cleared_date: method !== "check" ? paymentDate : null,
      funding_source: fundingSource,
      draw_id: null,
      vendor_payment_id: null,
      notes: notes.trim() || null,
      invoices: invoiceInputs,
    };

    setError(null);
    startTransition(async () => {
      const result = await createPayment(input);
      if (result.error) {
        setError(result.error);
      } else {
        onCreated();
      }
    });
  }

  const isCheck = method === "check";

  return (
    <Modal onClose={onClose} wide>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        New Payment
      </h3>
      <p className="text-sm text-gray-500 mb-5">
        Select invoices and enter payment details. One payment can cover
        multiple invoices across projects.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Payment details row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Method
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
          >
            <option value="check">Check</option>
            <option value="ach">ACH</option>
            <option value="wire">Wire</option>
            <option value="auto_draft">Auto-Draft</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isCheck ? "Check #" : "Reference #"}
          </label>
          <input
            type="text"
            value={paymentNumber}
            onChange={(e) => setPaymentNumber(e.target.value)}
            placeholder={isCheck ? "1073" : "Optional"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Payment Date
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Funding Source
          </label>
          <select
            value={fundingSource}
            onChange={(e) =>
              setFundingSource(e.target.value as typeof fundingSource)
            }
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
          >
            <option value="dda">DDA (Operating Cash)</option>
            <option value="bank_funded">Bank Funded (Draw)</option>
            <option value="owner_funded">Owner Funded</option>
          </select>
        </div>
      </div>

      {/* Notes */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Notes (optional)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g., Weekly vendor payment run"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
        />
      </div>

      {/* Invoice selection */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-800">
            Select Invoices
          </h4>
          <span className="text-xs text-gray-500">
            {selectedInvoices.size} selected \u2022 {fmt(selectedTotal)}
          </span>
        </div>
        {/* Vendor search */}
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Filter by vendor name..."
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30"
          />
        </div>

        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
          {filteredVendors.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No approved invoices available for payment.
            </div>
          ) : (
            filteredVendors.map((group) => {
              const allSelected = group.invoices.every((inv) =>
                selectedInvoices.has(inv.id)
              );
              const someSelected = group.invoices.some((inv) =>
                selectedInvoices.has(inv.id)
              );
              const groupTotal = group.invoices.reduce(
                (s, inv) => s + inv.amount,
                0
              );

              return (
                <div key={group.vendor}>
                  {/* Vendor header row */}
                  <div
                    className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                    onClick={() => selectVendorInvoices(group.invoices)}
                  >
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      readOnly
                      className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                    />
                    <span className="text-sm font-medium text-gray-800 flex-1">
                      {group.vendor}
                    </span>
                    <span className="text-xs font-mono text-gray-500">
                      {group.invoices.length} inv \u2022 {fmt(groupTotal)}
                    </span>
                  </div>
                  {/* Individual invoices */}
                  {group.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 px-3 py-1.5 pl-8 border-b border-gray-100 cursor-pointer hover:bg-blue-50/30"
                      onClick={() => toggleInvoice(inv.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInvoices.has(inv.id)}
                        readOnly
                        className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                      />
                      <span className="text-xs text-gray-600 flex-1 truncate">
                        #{inv.invoice_number ?? "\u2014"}{" "}
                        <span className="text-gray-400">
                          {inv.project_name ?? "No project"}
                          {inv.cost_code && ` / Code ${inv.cost_code}`}
                        </span>
                      </span>
                      <span className="text-xs text-gray-500">
                        {inv.due_date
                          ? `Due ${fmtDate(inv.due_date)}`
                          : ""}
                      </span>
                      <span className="text-xs font-mono text-gray-700 w-20 text-right">
                        {fmt(inv.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* GL posting info */}
      <div className="bg-gray-50 rounded-lg px-4 py-3 mb-5 text-xs text-gray-500">
        <span className="font-medium text-gray-600">GL posting:</span>{" "}
        {isCheck
          ? "DR Accounts Payable (2000) / CR Checks Outstanding (2050)"
          : "DR Accounts Payable (2000) / CR Cash (1000)"}
        {!isCheck && " \u2014 invoices will be marked Cleared immediately."}
        {isCheck && " \u2014 invoices will be marked Released (use Mark Cleared when check clears bank)."}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
       