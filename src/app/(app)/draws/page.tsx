import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { getDrawableInvoices } from "@/app/actions/draws";
import { drawDisplayName } from "@/lib/draws";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  funded:    "bg-blue-100 text-blue-700",
  paid:      "bg-green-100 text-green-700",
};

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function DrawsPage() {
  const supabase = await createClient();

  const [drawsResult, eligibleResult] = await Promise.all([
    supabase
      .from("loan_draws")
      .select(`id, draw_number, draw_date, total_amount, status, contacts ( name )`)
      .order("draw_number", { ascending: false }),
    getDrawableInvoices(),
  ]);

  const draws = drawsResult.data ?? [];
  const eligibleInvoices = eligibleResult.invoices ?? [];
  const eligibleTotal = eligibleInvoices.reduce((s, inv) => s + (inv.amount ?? 0), 0);

  return (
    <>
      <Header title="Draw Requests" />
      <main className="flex-1 p-6 overflow-auto">
        {/* Pending draw banner */}
        {eligibleInvoices.length > 0 && (
          <div className="flex items-center justify-between bg-[#4272EF]/5 border border-[#4272EF]/20 rounded-xl px-5 py-4 mb-5">
            <div>
              <p className="text-sm font-semibold text-[#4272EF]">
                {eligibleInvoices.length} invoice{eligibleInvoices.length !== 1 ? "s" : ""} ready for draw
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{fmt(eligibleTotal)} total approved &amp; pending</p>
            </div>
            <Link
              href="/draws/new"
              className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
            >
              <Plus size={16} />
              New Draw Request
            </Link>
          </div>
        )}

        {/* Header row when no pending */}
        {eligibleInvoices.length === 0 && (
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-gray-500">
              {draws.length > 0
                ? `${draws.length} draw${draws.length !== 1 ? "s" : ""}`
                : "No draws yet"}
            </p>
            <Link
              href="/draws/new"
              className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
            >
              <Plus size={16} />
              New Draw Request
            </Link>
          </div>
        )}

        {/* Draws list */}
        {draws.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
            No draw requests yet.{" "}
            {eligibleInvoices.length > 0 ? (
              <Link href="/draws/new" className="text-[#4272EF] hover:underline">
                Create your first draw request
              </Link>
            ) : (
              "Approve invoices and mark them for draw to get started."
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Draw", "Date", "Lender", "Total", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {draws.map((draw) => {
                  const lender = draw.contacts as { name: string } | null;
                  return (
                    <tr key={draw.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {drawDisplayName(draw.draw_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{draw.draw_date}</td>
                      <td className="px-4 py-3 text-gray-700">{lender?.name ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{fmt(draw.total_amount)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[draw.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {draw.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/draws/${draw.id}`}
                          className="flex items-center gap-1.5 text-xs text-[#4272EF] hover:text-[#3461de] font-medium transition-colors"
                        >
                          <FileText size={13} />
                          View
                        </Link>
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
