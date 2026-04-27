import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus } from "lucide-react";
import { runNotifications } from "@/app/actions/vendors";
import VendorsClient from "./VendorsClient";


export default async function VendorsPage() {
  await runNotifications();

  const supabase = await createClient();

  // Vendor metrics (YTD spend, open invoices) come from the invoices table.
  // Per UI Review § 10 #62: "fewer columns, more info per cell".
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [{ data: vendors }, { data: invoices }, { data: contracts }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, email, phone, trade, coi_expiry_date, license_expiry_date, is_active, notes")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("invoices")
      .select("id, vendor_id, status, amount, total_amount, invoice_date, due_date"),
    supabase
      .from("contracts")
      .select("id, vendor_id, status"),
  ]);

  const rows = vendors ?? [];
  const allInvoices = invoices ?? [];

  const ytdSpendByVendor: Record<string, number> = {};
  const openInvoicesByVendor: Record<string, number> = {};
  const openAmountByVendor: Record<string, number> = {};
  const lastInvoiceByVendor: Record<string, string> = {};

  for (const inv of allInvoices) {
    if (!inv.vendor_id) continue;
    const amt = inv.total_amount ?? inv.amount ?? 0;
    if ((inv.status === "approved" || inv.status === "released" || inv.status === "cleared") && (inv.invoice_date ?? "") >= yearStart) {
      ytdSpendByVendor[inv.vendor_id] = (ytdSpendByVendor[inv.vendor_id] ?? 0) + amt;
    }
    if (inv.status === "approved" || inv.status === "pending_review" || inv.status === "released") {
      openInvoicesByVendor[inv.vendor_id] = (openInvoicesByVendor[inv.vendor_id] ?? 0) + 1;
      openAmountByVendor[inv.vendor_id] = (openAmountByVendor[inv.vendor_id] ?? 0) + amt;
    }
    if (inv.invoice_date) {
      const cur = lastInvoiceByVendor[inv.vendor_id];
      if (!cur || inv.invoice_date > cur) lastInvoiceByVendor[inv.vendor_id] = inv.invoice_date;
    }
  }

  const activeContractsByVendor: Record<string, number> = {};
  for (const c of contracts ?? []) {
    if (c.vendor_id && c.status === "active") {
      activeContractsByVendor[c.vendor_id] = (activeContractsByVendor[c.vendor_id] ?? 0) + 1;
    }
  }

  const enriched = rows.map((v) => ({
    ...v,
    ytd_spend: ytdSpendByVendor[v.id] ?? 0,
    open_invoices: openInvoicesByVendor[v.id] ?? 0,
    open_amount: openAmountByVendor[v.id] ?? 0,
    last_invoice_date: lastInvoiceByVendor[v.id] ?? null,
    active_contracts: activeContractsByVendor[v.id] ?? 0,
  }));

  return (
    <>
      <Header title="Vendors" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        {/* Header row — banner replaced by filter chips inside VendorsClient
            per UI Review § 10 #61. */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500">
            {rows.length} active vendor{rows.length !== 1 ? "s" : ""}
          </p>
          <Link
            href="/vendors/new"
            className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
          >
            <Plus size={16} />
            Add Vendor
          </Link>
        </div>

        <VendorsClient vendors={enriched as unknown as Parameters<typeof VendorsClient>[0]["vendors"]} />
      </main>
    </>
  );
}
