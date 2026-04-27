import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDrawableInvoices } from "@/app/actions/draws";
import DrawsTableClient from "@/components/draws/DrawsTableClient";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";
import AdminOnly from "@/components/ui/AdminOnly";


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

  const rawDraws = drawsResult.data ?? [];
  const draws = rawDraws.map((d) => ({
    id: d.id,
    draw_date: d.draw_date,
    total_amount: d.total_amount,
    status: d.status,
    lenderName: (d.contacts as { name: string } | null)?.name ?? null,
  }));
  const eligibleInvoices = eligibleResult.invoices ?? [];
  const eligibleTotal = eligibleInvoices.reduce((s, inv) => s + (inv.amount ?? 0), 0);

  return (
    <>
      <Header title="Draw Requests" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <ReadOnlyBanner />
        {/* Pending draw banner */}
        {eligibleInvoices.length > 0 && (
          <div className="flex items-center justify-between bg-[#4272EF]/5 border border-[#4272EF]/20 rounded-xl px-5 py-4 mb-5">
            <div>
              <p className="text-sm font-semibold text-[#4272EF]">
                {eligibleInvoices.length} invoice{eligibleInvoices.length !== 1 ? "s" : ""} ready for draw
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{fmt(eligibleTotal)} total approved &amp; pending</p>
            </div>
            <AdminOnly>
              <Link
                href="/draws/new"
                className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
              >
                <Plus size={16} />
                New Draw Request
              </Link>
            </AdminOnly>
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
            <AdminOnly>
              <Link
                href="/draws/new"
                className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
              >
                <Plus size={16} />
                New Draw Request
              </Link>
            </AdminOnly>
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
          <DrawsTableClient draws={draws} />
        )}
      </main>
    </>
  );
}
