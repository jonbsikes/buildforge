import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, AlertTriangle } from "lucide-react";
import InvoicesTable from "@/components/invoices/InvoicesTable";
import PollEmailButton from "@/components/invoices/PollEmailButton";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";
import AdminOnly from "@/components/ui/AdminOnly";

export const dynamic = "force-dynamic";


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

  const lowConfCount = rows.filter(
    (i) => i.ai_confidence === "low" && i.status === "pending_review"
  ).length;

  return (
    <>
      <Header title="Accounts Payable" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <ReadOnlyBanner />

          {/* Low confidence alert */}
          {lowConfCount > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
              <AlertTriangle size={16} className="flex-shrink-0 text-amber-500" />
              {lowConfCount} invoice{lowConfCount > 1 ? "s" : ""} flagged as low AI confidence — manual review required before approval.
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
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
              No invoices yet.{" "}
              <Link href="/invoices/upload" className="text-[#4272EF] hover:underline">
                Add one
              </Link>
            </div>
          ) : (
            <InvoicesTable rows={rows as any} />
          )}
        </div>
      </main>
    </>
  );
}
         