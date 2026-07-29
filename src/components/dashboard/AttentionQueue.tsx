"use client";

/**
 * Dashboard "Needs Attention" work queue (Package 02).
 *
 * Renders the worst ≤5 individual attention items (scored server-side in
 * dashboard/page.tsx) as AttentionCard rows inside a white card, each with an
 * optional one-tap primary action:
 *   - approve      → calls approveInvoice() optimistically (same pattern as
 *                    InvoicesTable.approveRow), toast on error
 *   - review       → link to the invoice edit page (needs-attention guard)
 *   - issue_check  → link to the invoice detail (check-number form lives there)
 * Everything else gets the card's default "Open →".
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";
import { approveInvoice } from "@/app/actions/invoices";
import AttentionCard, { type AttentionKind } from "./AttentionCard";
import { useToast } from "@/components/ui/Toast";

export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  title: string;
  subtitle: string;
  href: string;
  action?: "approve" | "review" | "issue_check" | "open_vendor";
  invoiceId?: string;
}

export default function AttentionQueue({
  items,
  totalCount,
  rollup,
}: {
  items: AttentionItem[];
  totalCount: number;
  rollup: string[];
}) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  function approve(invoiceId: string) {
    setApprovedIds((prev) => new Set(prev).add(invoiceId));
    startTransition(async () => {
      const r = await approveInvoice(invoiceId);
      if (r.error) {
        setApprovedIds((prev) => {
          const n = new Set(prev);
          n.delete(invoiceId);
          return n;
        });
        toast.error(r.error);
      }
    });
  }

  function primaryAction(item: AttentionItem) {
    if (item.action === "approve" && item.invoiceId) {
      const done = approvedIds.has(item.invoiceId);
      if (done) {
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold"
            style={{ color: "var(--status-complete)" }}
          >
            <Check size={12} /> Approved
          </span>
        );
      }
      const invoiceId = item.invoiceId;
      return (
        <button
          onClick={() => approve(invoiceId)}
          className="min-h-[44px] lg:min-h-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--brand-blue)" }}
        >
          Approve
        </button>
      );
    }
    if (item.action === "review" && item.invoiceId) {
      return (
        <Link
          href={`/invoices/${item.invoiceId}/edit`}
          className="min-h-[44px] lg:min-h-0 inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[color:var(--card-border)] text-gray-700 hover:bg-gray-50"
        >
          Review
        </Link>
      );
    }
    if (item.action === "issue_check" && item.invoiceId) {
      return (
        <Link
          href={`/invoices/${item.invoiceId}`}
          className="min-h-[44px] lg:min-h-0 inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: "var(--brand-blue)" }}
        >
          Issue check
        </Link>
      );
    }
    if (item.action === "open_vendor") {
      return (
        <Link
          href={item.href}
          className="min-h-[44px] lg:min-h-0 inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-[color:var(--card-border)] text-gray-700 hover:bg-gray-50"
        >
          Open vendor
        </Link>
      );
    }
    return undefined;
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={13} style={{ color: "var(--status-warning)" }} />
          <span
            className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-700"
          >
            Needs Attention · {totalCount}
          </span>
        </div>
        <Link
          href="/notifications"
          className="text-xs font-medium"
          style={{ color: "var(--brand-blue)" }}
        >
          View all →
        </Link>
      </div>
      <div
        className="overflow-hidden"
        style={{
          backgroundColor: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--card-radius)",
        }}
      >
        {items.map((item) => (
          <AttentionCard
            key={item.key}
            kind={item.kind}
            title={item.title}
            subtitle={item.subtitle}
            href={item.href}
            primaryAction={primaryAction(item)}
          />
        ))}
        {rollup.length > 0 && (
          <div className="px-4 py-2.5 text-xs text-gray-500 bg-gray-50/60 flex flex-wrap gap-x-2 gap-y-1">
            {rollup.map((r, i) => (
              <span key={r}>
                {i > 0 && <span className="text-gray-300 mr-2">·</span>}
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
