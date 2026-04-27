import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, AlertTriangle, Receipt } from "lucide-react";
import InvoicesTable from "@/components/invoices/InvoicesTable";
import PollEmailButton from "@/components/invoices/PollEmailButton";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";
import AdminOnly from "@/components/ui/AdminOnly";
import EmptyState from "@/components/ui/EmptyState";



export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      id, vendor, vendor_id, invoice_number, invoice_date, due_date,
      amount, status, ai_confidence, pending_draw, manually_reviewed,
      file_name, source, discount_taken, direct_cash_payment,
      projects ( id, name ),
      cost_codes ( code, name ),
      vendors ( auto_draft )
    `)
    .order("created_at", { ascending: false });

  const baseRows = invoices ?? [];

  // Look up which invoices are attached to a draw request so we can show
  // a bank icon next to the status on the AP screen. A single invoice can
  // (rarely) be linked to more than one draw — show the most recent one.
  const invoiceIds = baseRows.map((r) => r.id);
  const drawByInvoice = new Map<
    string,
    { id: string; draw_number: number | null; draw_date: string | null; status: string | null }
  >();
  if (invoiceIds.length > 0) {
    const { data: drawLinks } = await supabase
      .from("draw_invoices")
      .select(`invoice_id, loan_draws ( id, draw_number, draw_date, status )`)
      .in("invoice_id", invoiceIds);
    for (const link of drawLinks ?? []) {
      const d = (link as { loan_draws: { id: string; draw_number: number | null; draw_date: string | null; status: string | null } | null }).loan_draws;
      if (!d) continue;
      const existing = drawByInvoice.get((link as { invoice_id: string }).invoice_id);
      // Keep the most recent draw (by draw_date)
      if (!existing || (d.draw_date && (!existing.draw_date || d.draw_date > existing.draw_date))) {
        drawByInvoice.set((link as { invoice_id: string }).invoice_id, d);
      }
    }
  }

  const rows = baseRows.map((r) => ({
    ...r,
    in_draw: drawByInvoice.get(r.id) ?? null,
  }));

  // ---------------------------------------------------------------------------
  // Compute the unified "Needs attention" set. A pending invoice needs
  // attention if it's missing ANY of the three required-from-dropdown fields:
  // vendor (matched to master list), cost code on every line, or a positive
  // amount. AI low-confidence rows are also included since the extractor
  // forces low when any of those three is missing.
  // ---------------------------------------------------------------------------
  const pendingIds = rows.filter((r) => r.status === "pending_review").map((r) => r.id);

  const needsAttention = new Set<string>();
  const reasons = { missingVendor: 0, missingCostCode: 0, missingAmount: 0 };

  for (const inv of rows) {
    if (inv.status !== "pending_review") continue;
    let flagged = false;
    if (!inv.vendor_id) {
      reasons.missingVendor++;
      flagged = true;
    }
    if (inv.amount == null || inv.amount <= 0) {
      reasons.missingAmount++;
      flagged = true;
    }
    if (flagged || inv.ai_confidence === "low") {
      needsAttention.add(inv.id);
    }
  }

  if (pendingIds.length) {
    const { data: lineRows } = await supabase
      .from("invoice_line_items")
      .select("invoice_id, cost_code")
      .in("invoice_id", pendingIds);
    const missingCodeIds = new Set<string>();
    for (const li of lineRows ?? []) {
      const row = li as { invoice_id: string; cost_code: string | null };
      if (!row.cost_code) missingCodeIds.add(row.invoice_id);
    }
    reasons.missingCostCode = missingCodeIds.size;
    for (const id of missingCodeIds) needsAttention.add(id);
  }

  const needsAttentionCount = needsAttention.size;

  return (
    <>
      <Header title="Accounts Payable" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <ReadOnlyBanner />

          {/* Unified "Needs attention" strip — fires when an invoice is
              missing any of the three required-from-dropdown fields (vendor,
              cost code, amount) or when AI flagged it as low confidence.
              These rows can't be approved until the user fixes them on the
              edit form. */}
          {needsAttentionCount > 0 && (
            <div className="bg-white border border-[color:var(--card-border)] rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <div className="flex items-center gap-2 font-medium pr-2 mr-1 border-r border-[color:var(--border-weak)]" style={{ color: "var(--status-over)" }}>
                <AlertTriangle size={14} />
                <span className="font-semibold tabular-nums">{needsAttentionCount}</span>
                {needsAttentionCount === 1 ? "invoice needs attention" : "invoices need attention"}
              </div>
              {reasons.missingVendor > 0 && (
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-over)" }} />
                  <span className="font-semibold tabular-nums">{reasons.missingVendor}</span>
                  <span className="text-[color:var(--text-secondary)]">missing vendor</span>
                </span>
              )}
              {reasons.missingCostCode > 0 && (
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-over)" }} />
                  <span className="font-semibold tabular-nums">{reasons.missingCostCode}</span>
                  <span className="text-[color:var(--text-secondary)]">missing cost code</span>
                </span>
              )}
              {reasons.missingAmount > 0 && (
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-over)" }} />
                  <span className="font-semibold tabular-nums">{reasons.missingAmount}</span>
                  <span className="text-[color:var(--text-secondary)]">missing amount</span>
                </span>
              )}
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              {rows.length} Invoice{rows.length !== 1 ? "s" : ""}
            </h2>
            <AdminOnly>
              <div className="flex items-center gap-3">
                <PollEmailButton />
                <Link
                  href="/invoices/upload"
                  className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
                >
                  <Plus size={16} />
                  New Invoice
                </Link>
              </div>
            </AdminOnly>
          </div>

          {rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icon={<Receipt size={20} />}
                title="No invoices yet"
                description="Invoices route through this page from email ingestion or direct upload. Once uploaded, AI extracts the vendor, amount, dates and suggests cost codes for review."
                steps={[
                  "Upload a PDF or image, or send to the Gmail address linked to BuildForge.",
                  "Review the AI-extracted fields and approve.",
                  "Track through approved → released → cleared.",
                ]}
                primary={{ label: "+ Add your first invoice", href: "/invoices/upload" }}
              />
            </div>
          ) : (
            <InvoicesTable
              rows={rows as unknown as Parameters<typeof InvoicesTable>[0]["rows"]}
              needsAttentionIds={Array.from(needsAttention)}
            />
          )}
        </div>
      </main>
    </>
  );
}
         