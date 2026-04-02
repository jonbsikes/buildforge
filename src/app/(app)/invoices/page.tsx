import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, AlertTriangle, Mail } from "lucide-react";
import InvoiceActions from "@/components/invoices/InvoiceActions";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  approved:       "bg-blue-100 text-blue-700",
  scheduled:      "bg-purple-100 text-purple-700",
  paid:           "bg-green-100 text-green-700",
  disputed:       "bg-red-100 text-red-600",
};

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

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
      <main className="flex-1 p-6 overflow-auto">
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
          <Link
            href="/invoices/new"
            className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
          >
            <Plus size={16} />
            New Invoice
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
            No invoices yet.{" "}
            <Link href="/invoices/new" className="text-[#4272EF] hover:underline">
              Add one
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Vendor / Invoice", "Project", "Date", "Due", "Amount", "Status", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((inv) => {
                  const project = inv.projects as { id: string; name: string } | null;
                  const isLowConf =
                    inv.ai_confidence === "low" && inv.status === "pending_review";
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-0 py-0">
                        <Link href={`/invoices/${inv.id}`} className="block px-4 py-3">
                          <p className="font-medium text-gray-900 flex items-center gap-1.5">
                            {isLowConf && (
                              <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
                            )}
                            {inv.vendor ?? "—"}
                          </p>
                          <p className="text-xs text-gray-400 flex items-center gap-1.5">
                            {inv.invoice_number ?? "No #"}
                            {inv.pending_draw && (
                              <span className="text-[#4272EF] font-medium">• Draw</span>
                            )}
                            {inv.source === "email" && (
                              <span
                                className="inline-flex items-center gap-0.5 text-[#4272EF]"
                                title="Imported via Gmail"
                              >
                                <Mail size={11} />
                                <span className="text-[10px] font-medium">Email</span>
                              </span>
                            )}
                          </p>
                        </Link>
                      </td>
                      <td className="px-0 py-0">
                        <Link href={`/invoices/${inv.id}`} className="block px-4 py-3 text-gray-600 text-xs">
                          {project?.name ?? <span className="text-gray-400">G&A</span>}
                        </Link>
                      </td>
                      <td className="px-0 py-0">
                        <Link href={`/invoices/${inv.id}`} className="block px-4 py-3 text-gray-600 text-xs">
                          {inv.invoice_date ?? "—"}
                        </Link>
                      </td>
                      <td className="px-0 py-0">
                        <Link href={`/invoices/${inv.id}`} className="block px-4 py-3 text-gray-600 text-xs">
                          {inv.due_date ?? "—"}
                        </Link>
                      </td>
                      <td className="px-0 py-0">
                        <Link href={`/invoices/${inv.id}`} className="block px-4 py-3 font-medium text-gray-900">
                          {fmt(inv.amount)}
                        </Link>
                      </td>
                      <td className="px-0 py-0">
                        <Link href={`/invoices/${inv.id}`} className="block px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {inv.status.replace("_", " ")}
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <InvoiceActions
                          invoiceId={inv.id}
                          status={inv.status}
                          aiConfidence={inv.ai_confidence}
                          manuallyReviewed={inv.manually_reviewed ?? false}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
