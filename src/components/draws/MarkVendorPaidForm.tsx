"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markVendorPaymentPaid } from "@/app/actions/draws";
import { CheckCircle2, Coins, ChevronDown, ChevronUp, Plus } from "lucide-react";

interface AvailableCredit {
  id: string;
  credit_date: string;
  credit_number: string | null;
  amount: number;
  applied_amount: number;
  remaining: number;
  reason: string | null;
}

interface Props {
  vendorPaymentId: string;
  vendorPaymentAmount?: number;
  defaultDate: string;
  vendorId?: string | null;
  vendorName?: string | null;
  availableCredits?: AvailableCredit[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function MarkVendorPaidForm({
  vendorPaymentId,
  vendorPaymentAmount,
  defaultDate,
  vendorId,
  availableCredits = [],
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checkNumber, setCheckNumber] = useState("");
  const [paymentDate, setPaymentDate] = useState(defaultDate);
  const [discountAmount, setDiscountAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasCredits = availableCredits.length > 0;
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditSelections, setCreditSelections] = useState<Record<string, { selected: boolean; amount: string }>>({});

  // Initialize selections (auto-apply oldest first up to vp.amount − discount)
  useEffect(() => {
    const init: Record<string, { selected: boolean; amount: string }> = {};
    const target = Math.max(0, (vendorPaymentAmount ?? 0));
    let remaining = target;
    for (const c of availableCredits) {
      if (remaining <= 0.005) {
        init[c.id] = { selected: false, amount: c.remaining.toFixed(2) };
        continue;
      }
      const take = Math.min(c.remaining, remaining);
      init[c.id] = { selected: true, amount: take.toFixed(2) };
      remaining -= take;
    }
    setCreditSelections(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCredits.length]);

  const discount = parseFloat(discountAmount) || 0;
  const creditsTotal = useMemo(() => {
    let s = 0;
    for (const c of availableCredits) {
      const sel = creditSelections[c.id];
      if (sel?.selected) s += parseFloat(sel.amount) || 0;
    }
    return s;
  }, [creditSelections, availableCredits]);

  const netAmount = vendorPaymentAmount != null
    ? Math.max(0, vendorPaymentAmount - discount - creditsTotal)
    : undefined;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (discount < 0) { setError("Discount cannot be negative"); return; }
    if (vendorPaymentAmount && discount >= vendorPaymentAmount) { setError("Discount cannot exceed payment amount"); return; }
    if (vendorPaymentAmount && discount + creditsTotal > vendorPaymentAmount + 0.005) {
      setError("Discount + credits exceed payment amount");
      return;
    }
    const apps = availableCredits
      .map((c) => {
        const sel = creditSelections[c.id];
        if (!sel?.selected) return null;
        const amt = parseFloat(sel.amount) || 0;
        if (amt <= 0) return null;
        return { credit_id: c.id, amount: amt };
      })
      .filter((x): x is { credit_id: string; amount: number } => x !== null);

    startTransition(async () => {
      const result = await markVendorPaymentPaid(
        vendorPaymentId,
        checkNumber,
        paymentDate,
        discount > 0 ? discount : undefined,
        apps.length > 0 ? apps : undefined
      );
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Check #"
          value={checkNumber}
          onChange={(e) => setCheckNumber(e.target.value)}
          className="w-28 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 focus:border-[#4272EF]"
        />
        <input
          type="date"
          required
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 focus:border-[#4272EF]"
        />
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Discount"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            className="w-24 pl-5 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 focus:border-[#4272EF]"
            title="Early-pay discount amount (optional)"
          />
        </div>
        {hasCredits && (
          <button
            type="button"
            onClick={() => setCreditsOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-amber-300 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
            title={`${availableCredits.length} credit(s) available — ${fmt(availableCredits.reduce((s, c) => s + c.remaining, 0))}`}
          >
            <Coins size={12} />
            Credits ({fmt(creditsTotal)})
            {creditsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        {vendorId && !hasCredits && (
          <Link
            href={`/invoices/credits/new?vendor=${vendorId}`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 text-gray-500 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            title="Add a credit for this vendor"
          >
            <Plus size={11} />
            Add credit
          </Link>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
        >
          <CheckCircle2 size={13} />
          {isPending ? "Posting…" : "Mark Paid"}
        </button>
        {(discount > 0 || creditsTotal > 0) && netAmount != null && (
          <span className="text-xs text-gray-700 font-medium">
            Net: <span className="text-green-600">{fmt(netAmount)}</span>
          </span>
        )}
      </div>

      {hasCredits && creditsOpen && (
        <div className="border border-amber-100 bg-amber-50/40 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold text-amber-700 inline-flex items-center gap-1">
              <Coins size={11} /> Apply vendor credits
            </p>
            {vendorId && (
              <Link
                href={`/invoices/credits/new?vendor=${vendorId}`}
                className="text-[11px] text-[#4272EF] hover:underline"
              >
                + New credit
              </Link>
            )}
          </div>
          {availableCredits.map((c) => {
            const sel = creditSelections[c.id] ?? { selected: false, amount: c.remaining.toFixed(2) };
            return (
              <div key={c.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={sel.selected}
                  onChange={(e) =>
                    setCreditSelections((p) => ({
                      ...p,
                      [c.id]: { ...sel, selected: e.target.checked },
                    }))
                  }
                  className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-gray-700">
                    {c.credit_date}{c.credit_number ? ` · #${c.credit_number}` : ""}
                  </span>
                  <span className="text-gray-400 ml-1.5">(avail {fmt(c.remaining)})</span>
                </div>
                <div className="relative w-24">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px]">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={c.remaining}
                    value={sel.amount}
                    disabled={!sel.selected}
                    onChange={(e) =>
                      setCreditSelections((p) => ({
                        ...p,
                        [c.id]: { selected: sel.selected, amount: e.target.value },
                      }))
                    }
                    className="w-full pl-5 pr-2 py-1 border border-gray-300 rounded text-xs tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-[#4272EF] disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            );
          })}
          {vendorPaymentAmount != null && (
            <div className="text-[11px] tabular-nums pt-1.5 mt-1 border-t border-amber-200/60 flex justify-between text-gray-700">
              <span>Gross {fmt(vendorPaymentAmount)} − disc {fmt(discount)} − credits {fmt(creditsTotal)}</span>
              <span className="font-semibold">Net {fmt(netAmount ?? 0)}</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </form>
  );
}
