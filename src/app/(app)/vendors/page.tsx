import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, AlertCircle, AlertTriangle } from "lucide-react";
import { runNotifications } from "@/app/actions/vendors";
import VendorsClient from "./VendorsClient";

export const dynamic = "force-dynamic";

function expiryStatus(date: string | null): "expired" | "expiring" | "ok" {
  if (!date) return "ok";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "expired";
  if (diff <= 30) return "expiring";
  return "ok";
}

export default async function VendorsPage() {
  await runNotifications();

  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, email, phone, trade, coi_expiry_date, license_expiry_date, is_active, notes")
    .eq("is_active", true)
    .order("name");

  const rows = vendors ?? [];

  const expired = rows.filter(
    (v) =>
      expiryStatus(v.coi_expiry_date) === "expired" ||
      expiryStatus(v.license_expiry_date) === "expired"
  ).length;
  const expiring = rows.filter(
    (v) =>
      expiryStatus(v.coi_expiry_date) === "expiring" ||
      expiryStatus(v.license_expiry_date) === "expiring"
  ).length;

  return (
    <>
      <Header title="Vendors" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        {/* Compliance banner */}
        {(expired > 0 || expiring > 0) && (
          <div className="flex flex-wrap gap-3 mb-5">
            {expired > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                <span className="text-red-700 font-medium">
                  {expired} vendor{expired !== 1 ? "s" : ""} with expired COI or license
                </span>
              </div>
            )}
            {expiring > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                <span className="text-amber-700 font-medium">
                  {expiring} vendor{expiring !== 1 ? "s" : ""} with COI or license expiring within 30 days
                </span>
              </div>
            )}
          </div>
        )}

        {/* Header row */}
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

        <VendorsClient vendors={rows as any[]} />
      </main>
    </>
  );
}
