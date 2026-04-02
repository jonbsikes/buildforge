// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type PO = Database["public"]["Tables"]["purchase_orders"]["Row"];
type Project = Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name">;
type Vendor = Pick<Database["public"]["Tables"]["vendors"]["Row"], "id" | "name">;
type CostCode = Pick<Database["public"]["Tables"]["cost_codes"]["Row"], "code" | "description">;

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  acknowledged: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [posRes, projectsRes, vendorsRes, codesRes] = await Promise.all([
    supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name"),
    supabase.from("vendors").select("id, name"),
    supabase.from("cost_codes").select("code, description"),
  ]);

  const allPOs = (posRes.data ?? []) as PO[];
  const projects = (projectsRes.data ?? []) as Project[];
  const vendors = (vendorsRes.data ?? []) as Vendor[];
  const costCodes = (codesRes.data ?? []) as CostCode[];
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const codeMap = Object.fromEntries(costCodes.map((c) => [c.code, c.description]));

  const activeFilter = params.status ?? "all";
  const pos = activeFilter === "all" ? allPOs : allPOs.filter((p) => p.status === activeFilter);

  const totalOpen = allPOs.filter((p) => p.status !== "closed").reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <Header title="Purchase Orders" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: "Open POs", value: allPOs.filter((p) => p.status !== "closed").length },
            { label: "Total Open Value", value: fmt(totalOpen) },
            { label: "Closed", value: allPOs.filter((p) => p.status === "closed").length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {["all", "draft", "sent", "acknowledged", "closed"].map((s) => (
              <Link key={s} href={`/purchase-orders?status=${s}`}
                className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  activeFilter === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                {s}
              </Link>
            ))}
          </div>
          <Link href="/purchase-orders/new"
            className="inline-flex items-center gap-2 bg-amber-500 text-gray-900 font-medium px-4 py-2 rounded-lg text-sm hover:bg-amber-400 transition-colors">
            <Plus size={15} /> New PO
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          {pos.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <ClipboardList size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No purchase orders yet.</p>
              <Link href="/purchase-orders/new" className="mt-2 inline-block text-sm text-amber-600 hover:underline">Create your first PO</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">PO #</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Project</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Vendor</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Description</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Cost Code</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Issued</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Amount</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pos.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-mono text-xs text-gray-700">{po.po_number}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{projectMap[po.project_id] ?? "—"}</td>
                      <td className="px-5 py-3 text-gray-600">{po.vendor_id ? vendorMap[po.vendor_id] : "—"}</td>
                      <td className="px-5 py-3 text-gray-700 max-w-[200px] truncate">{po.description}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {po.cost_code ? `${po.cost_code} — ${codeMap[po.cost_code] ?? ""}` : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(po.issued_date)}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">{fmt(po.amount)}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[po.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {po.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
