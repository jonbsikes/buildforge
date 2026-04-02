import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, AlertCircle, AlertTriangle, Phone, Mail } from "lucide-react";
import { runNotifications } from "@/app/actions/vendors";

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

function parseTrades(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {}
  return [raw];
}

export default async function VendorsPage() {
  // Refresh expiry notifications on every page load
  await runNotifications();

  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, email, phone, trade, coi_expiry_date, license_expiry_date, is_active, notes")
    .eq("is_active", true)
    .order("name");

  const rows = vendors ?? [];

  // Count compliance issues
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

        {/* Vendor list */}
        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center">
            <p className="text-sm font-medium text-gray-600 mb-1">No vendors yet</p>
            <p className="text-sm text-gray-400">
              <Link href="/vendors/new" className="text-[#4272EF] hover:underline">
                Add your first vendor
              </Link>{" "}
              to track subcontractors and suppliers.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((vendor) => {
              const trades = parseTrades(vendor.trade);
              const coiStatus = expiryStatus(vendor.coi_expiry_date);
              const licenseStatus = expiryStatus(vendor.license_expiry_date);
              const hasBlocker =
                coiStatus === "expired" || licenseStatus === "expired";
              const hasWarning =
                !hasBlocker &&
                (coiStatus === "expiring" || licenseStatus === "expiring");

              return (
                <div
                  key={vendor.id}
                  className={`bg-white rounded-xl border overflow-hidden transition-colors ${
                    hasBlocker
                      ? "border-red-200"
                      : hasWarning
                      ? "border-amber-200"
                      : "border-gray-200"
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900">{vendor.name}</h3>
                          {hasBlocker && (
                            <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                              <AlertCircle size={10} /> Compliance blocked
                            </span>
                          )}
                          {hasWarning && (
                            <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                              <AlertTriangle size={10} /> Expiring soon
                            </span>
                          )}
                        </div>

                        {/* Trades */}
                        {trades.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {trades.map((t) => (
                              <span
                                key={t}
                                className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Contact info */}
                        <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
                          {vendor.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={11} /> {vendor.phone}
                            </span>
                          )}
                          {vendor.email && (
                            <span className="flex items-center gap-1">
                              <Mail size={11} /> {vendor.email}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Compliance dates */}
                      <div className="flex flex-col gap-1.5 text-right flex-shrink-0">
                        <ComplianceDate
                          label="COI"
                          date={vendor.coi_expiry_date}
                          status={coiStatus}
                        />
                        <ComplianceDate
                          label="License"
                          date={vendor.license_expiry_date}
                          status={licenseStatus}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Blocking alert strip */}
                  {hasBlocker && (
                    <div className="bg-red-50 border-t border-red-200 px-5 py-2.5 flex items-center gap-2">
                      <AlertCircle size={13} className="text-red-500 flex-shrink-0" />
                      <p className="text-xs text-red-700">
                        {coiStatus === "expired" && licenseStatus === "expired"
                          ? "COI and license are both expired."
                          : coiStatus === "expired"
                          ? "Certificate of Insurance is expired. Do not issue new work orders."
                          : "Contractor license is expired. Do not issue new work orders."}
                      </p>
                      <Link
                        href={`/vendors/${vendor.id}`}
                        className="ml-auto text-xs text-red-600 hover:underline font-medium"
                      >
                        Update →
                      </Link>
                    </div>
                  )}

                  {/* Edit link */}
                  {!hasBlocker && (
                    <div className="border-t border-gray-50 px-5 py-2.5">
                      <Link
                        href={`/vendors/${vendor.id}`}
                        className="text-xs text-[#4272EF] hover:text-[#3461de] font-medium transition-colors"
                      >
                        Edit vendor →
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

function ComplianceDate({
  label,
  date,
  status,
}: {
  label: string;
  date: string | null;
  status: "expired" | "expiring" | "ok";
}) {
  if (!date) return null;
  return (
    <div
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        status === "expired"
          ? "bg-red-100 text-red-600"
          : status === "expiring"
          ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {label}: {date}
    </div>
  );
}
