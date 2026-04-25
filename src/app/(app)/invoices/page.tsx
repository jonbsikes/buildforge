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

  // Count pending invoices that need manual attention because extraction
  // couldn't resolve the vendor or a cost code. These rows can't be approved
  // as-is — saveInvoice rejects null vendor_id and invalid cost codes.
  const pendingIds = rows.filter((r) => r.status === "pending_review").map((r) => r.id);
  const missingVendorCount = rows.filter(
    (i) => i.status === "pending_review" && !i.vendor_id
  ).length;
  let missingCostCodeCount = 0;
  if (pendingIds.length) {
    const { data: lineRows } = await supabase
      .from("invoice_line_items")
      .select("invoice_id, cost_code")
      .in("invoice_id", pendingIds);
    const invoicesWithMissingCode = new Set<string>();
    for (const li of lineRows ?? []) {
      const row = li as { invoice_id: string; cost_code: string | null };
      if (!row.cost_code) invoicesWithMissingCode.add(row.invoice_id);
    }
    missingCostCodeCount = invoicesWithMissingCode.size;
  }

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

          {/* Missing vendor match — blocks approval because saveInvoice rejects null vendor_id */}
          {missingVendorCount > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-800">
              <AlertTriangle size={16} className="flex-shrink-0 text-red-500" />
              {missingVendorCount} pending invoice{missingVendorCount > 1 ? "s need" : " needs"} a vendor — open each one and select or create the vendor before approving.
            </div>
          )}

          {/* Missing or invalid cost codes */}
          {missingCostCodeCount > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
              <AlertTriangle size={16} className="flex-shrink-0 text-amber-500" />
              {missingCostCodeCount} pending invoice{missingCostCodeCount > 1 ? "s have" : " has"} a line item without a valid cost code — pick one before approving.
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
         