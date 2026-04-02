import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Header from "@/components/layout/Header";
import { ArrowLeft, Plus, FileSignature } from "lucide-react";
import { notFound } from "next/navigation";

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ContractsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, contractsRes] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).single(),
    supabase
      .from("contracts")
      .select("id, description, cost_code, contract_amount, status, signed_date, vendor_id, vendors(name)")
      .eq("project_id", id)
      .order("signed_date", { ascending: false }),
  ]);

  if (!projectRes.data) notFound();
  const project = projectRes.data;
  const contracts = contractsRes.data ?? [];

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    complete: "bg-blue-100 text-blue-700",
  };

  return (
    <>
      <Header title="Contracts" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <Link href={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
            <ArrowLeft size={15} /> {project.name}
          </Link>

          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-bold text-gray-900">Contracts</h1>
            <Link
              href={`/projects/${id}/contracts/new`}
              className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400 font-medium"
            >
              <Plus size={14} /> New Contract
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            {contracts.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <FileSignature size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm mb-4">No contracts yet for this project.</p>
                <Link
                  href={`/projects/${id}/contracts/new`}
                  className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-4 py-2 rounded-lg hover:bg-amber-400 font-medium"
                >
                  <Plus size={14} /> Add First Contract
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Vendor</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Description</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Cost Code</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Amount</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Signed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {contracts.map((c) => {
                      const vendor = (Array.isArray(c.vendors) ? c.vendors[0] : c.vendors) as { name: string } | null;
                      return (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3 font-medium text-gray-900">{vendor?.name ?? "—"}</td>
                          <td className="px-5 py-3 text-gray-600">
                            <Link href={`/projects/${id}/contracts/${c.id}`} className="text-amber-600 hover:underline">
                              {c.description}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-gray-500 font-mono text-xs">{c.cost_code ?? "—"}</td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900">{fmt(c.contract_amount)}</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[c.status ?? "draft"] ?? "bg-gray-100 text-gray-600"}`}>
                              {c.status ?? "draft"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(c.signed_date)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
