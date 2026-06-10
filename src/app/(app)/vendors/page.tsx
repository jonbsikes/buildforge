import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus } from "lucide-react";
import { runNotifications } from "@/app/actions/vendors";
import VendorsClient from "./VendorsClient";


export default async function VendorsPage() {
  await runNotifications();

  const supabase = await createClient();

  // Vendor metrics (YTD spend, open invoices) are aggregated per vendor in
  // SQL — the invoices table grows forever and would silently cap at 1,000.
  // Per UI Review § 10 #62: "fewer columns, more info per cell".
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [{ data: vendors }, vendorStatsRes, { data: contracts }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, email, phone, trade, coi_expiry_date, license_expiry_date, is_active, notes")
      .eq("is_active", true)
      .order("name"),
    (supabase.rpc as any)("get_vendor_invoice_stats", { p_year_start: yearStart }),
    supabase
      .from("contracts")
      .select("id, vendor_id, status"),
  ]);

  const rows = vendors ?? [];

  type VendorStats = {
    vendor_id: string;
    ytd_spend: number;
    open_invoices: number;
    open_amount: number;
    last_invoice_date: string | null;
  };
  const statsByVendor = new Map<string, VendorStats>();
  for (const s of (vendorStatsRes.data ?? []) as VendorStats[]) {
    statsByVendor.set(s.vendor_id, s);
  }

  const activeContractsByVendor: Record<string, number> = {};
  for (const c of contracts ?? []) {
    if (c.vendor_id && c.status === "active") {
      activeContractsByVendor[c.vendor_id] = (activeContractsByVendor[c.vendor_id] ?? 0) + 1;
    }
  }

  const enriched = rows.map((v) => {
    const s = statsByVendor.get(v.id);
    return {
      ...v,
      ytd_spend: Number(s?.ytd_spend ?? 0),
      open_invoices: Number(s?.open_invoices ?? 0),
      open_amount: Number(s?.open_amount ?? 0),
      last_invoice_date: s?.last_invoice_date ?? null,
      active_contracts: activeContractsByVendor[v.id] ?? 0,
    };
  });

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
