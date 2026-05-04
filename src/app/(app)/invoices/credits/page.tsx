import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import EditorOnly from "@/components/ui/EditorOnly";
import EmptyState from "@/components/ui/EmptyState";
import VendorCreditsTable from "@/components/credits/VendorCreditsTable";

export default async function VendorCreditsPage() {
  const supabase = await createClient();

  const { data: credits } = await supabase
    .from("vendor_credits")
    .select(`
      id, credit_date, credit_number, amount, applied_amount, status, reason,
      vendors ( id, name ),
      projects ( id, name )
    `)
    .order("credit_date", { ascending: false });

  const rows = (credits ?? []).map((c) => ({
    id: c.id as string,
    credit_date: c.credit_date as string,
    credit_number: (c.credit_number as string | null) ?? null,
    amount: Number(c.amount),
    applied_amount: Number(c.applied_amount ?? 0),
    remaining: Number(c.amount) - Number(c.applied_amount ?? 0),
    status: c.status as string,
    reason: (c.reason as string | null) ?? null,
    vendor: (c.vendors as { id: string; name: string } | null) ?? null,
    project: (c.projects as { id: string; name: string } | null) ?? null,
  }));

  const available = rows.filter((r) => r.status === "available");
  const totalAvailable = available.reduce((s, r) => s + r.remaining, 0);

  return (
    <>
      <Header
        title="Vendor Credits"
        breadcrumbs={[
          { label: "Accounts Payable", href: "/invoices" },
          { label: "Vendor Credits" },
        ]}
      />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {rows.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 pb-3 mb-4 border-b border-gray-200 tabular-nums">
              <div>
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-2">Available</span>
                <span className="text-sm font-bold text-gray-900">{available.length}</span>
                <span className="text-gray-300 mx-1.5">·</span>
                <span className="text-sm font-bold text-gray-900">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalAvailable)}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-2">Total credits</span>
                <span className="text-sm font-bold text-gray-900">{rows.length}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              {rows.length} Credit{rows.length !== 1 ? "s" : ""}
            </h2>
            <EditorOnly>
              <Link
                href="/invoices/credits/new"
                className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
              >
                <Plus size={16} />
                New Credit
              </Link>
            </EditorOnly>
          </div>

          {rows.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icon={<ReceiptText size={20} />}
                title="No vendor credits yet"
                description="Vendor credits offset what you owe. Enter a credit when a vendor issues a refund, billing correction, or credit memo."
                steps={[
                  "Click + New Credit and pick the vendor.",
                  "Enter the credit amount and tie it to a project (or leave blank for G&A).",
                  "The credit is auto-applied (oldest first) when you issue a check to that vendor.",
                ]}
                primary={{ label: "+ Add your first credit", href: "/invoices/credits/new" }}
              />
            </div>
          ) : (
            <VendorCreditsTable rows={rows} />
          )}
        </div>
      </main>
    </>
  );
}
