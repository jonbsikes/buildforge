import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Users, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Vendor = Database["public"]["Tables"]["vendors"]["Row"];

const typeLabels: Record<string, string> = {
  subcontractor: "Subcontractor",
  supplier: "Supplier",
  utility: "Utility",
  professional: "Professional",
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export default async function VendorsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("vendors").select("*").order("name");
  const vendors = (data ?? []) as Vendor[];

  const expiringSoon = vendors.filter((v) => {
    const coiDays = daysUntil(v.coi_expiry);
    const licDays = daysUntil(v.license_expiry);
    return (coiDays != null && coiDays <= 30) || (licDays != null && licDays <= 30);
  });

  return (
    <>
      <Header title="Vendors" />
      <main className="flex-1 p-6 overflow-auto">
        {expiringSoon.length > 0 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
            <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">COI or license expiring within 30 days</p>
              <p className="text-xs text-amber-600 mt-0.5">{expiringSoon.map((v) => v.name).join(", ")}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""}</p>
          <Link href="/vendors/new"
            className="inline-flex items-center gap-2 bg-amber-500 text-gray-900 font-medium px-4 py-2 rounded-lg text-sm hover:bg-amber-400 transition-colors">
            <Plus size={15} /> Add Vendor
          </Link>
        </div>

        {vendors.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
            <Users size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No vendors yet.</p>
            <Link href="/vendors/new" className="mt-2 inline-block text-sm text-amber-600 hover:underline">Add your first vendor</Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Type</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Contact</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">W-9</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">COI Expiry</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">License Expiry</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {vendors.map((v) => {
                    const coiDays = daysUntil(v.coi_expiry);
                    const licDays = daysUntil(v.license_expiry);
                    const coiAlert = coiDays != null && coiDays <= 0 ? "expired" : coiDays != null && coiDays <= 30 ? "soon" : null;
                    const licAlert = licDays != null && licDays <= 0 ? "expired" : licDays != null && licDays <= 30 ? "soon" : null;

                    return (
                      <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <Link href={`/vendors/${v.id}`} className="font-medium text-gray-900 hover:text-amber-600">
                            {v.name}
                          </Link>
                          {v.contact_name && <div className="text-xs text-gray-400">{v.contact_name}</div>}
                        </td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{typeLabels[v.type] ?? v.type}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {v.phone && <div>{v.phone}</div>}
                          {v.email && <div>{v.email}</div>}
                        </td>
                        <td className="px-5 py-3">
                          {v.w9_on_file ? (
                            <CheckCircle2 size={15} className="text-green-500" />
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {v.coi_expiry ? (
                            <span className={coiAlert === "expired" ? "text-red-600 font-medium" : coiAlert === "soon" ? "text-amber-600 font-medium" : "text-gray-500"}>
                              {coiAlert && <AlertTriangle size={11} className="inline mr-1" />}
                              {new Date(v.coi_expiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {v.license_expiry ? (
                            <span className={licAlert === "expired" ? "text-red-600 font-medium" : licAlert === "soon" ? "text-amber-600 font-medium" : "text-gray-500"}>
                              {licAlert && <AlertTriangle size={11} className="inline mr-1" />}
                              {new Date(v.license_expiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link href={`/vendors/${v.id}`} className="text-xs text-amber-600 hover:underline">View →</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
