import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, AlertTriangle } from "lucide-react";
import InvoicesTable from "@/components/invoices/InvoicesTable";
import PollEmailButton from "@/components/invoices/PollEmailButton";

export const dynamic = "force-dynamic";


export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      id, vendor, invoice_number, invoice_date, due_date,
      amount, status, ai_confidence, pending_draw, manually_reviewed,
      file_name, source,
      projects ( id, name )
    `)
    .order("created_at", { ascending: false });

  const rows = invoices ?? [];

  const pendingCount = rows.filter((i) => i.status === "pending_review").length;
  const lowConfCount = rows.filter(
    (i) => i.ai_confidence === "low" && i.status === "pending_review"
  ).length;

  return (
    <>
      <Header title="Accounts Payable" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        {/* Alerts */}
        {lowConfCount > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
            <AlertTriangle size={16} className="flex-shrink-0 text-amber-500" />
            {lowConfCount} invoice{lowConfCount > 1 ? "s" : ""} flagged as low AI confidence — manual review required before approval.
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {pendingCount > 0 ? `${pendingCount} pending review` : `${rows.length} invoice${rows.length !== 1 ? "s" : ""}`}
          </p>
          <div className="flex items-center gap-3">
            <PollEmailButton />
            <Link
              href="/invoices/upload?mode=batch"
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Plus size={16} />
              Batch Upload
            </Link>
            <Link
              href="/invoices/new"
              className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
            >
              <Plus size={16} />
              New Invoice
            </Link>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
            No invoices yet.{" "}
            <Link href="/invoices/new" className="text-[#4272EF] hover:underline">
              Add one
            </Link>
          </div>
        ) : (
          <InvoicesTable rows={rows as any} />
        )}
      </main>
    </>
  );
}
         