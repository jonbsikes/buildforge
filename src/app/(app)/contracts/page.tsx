import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, FileText, Pencil } from "lucide-react";
import DeleteContractButton from "@/components/contracts/DeleteContractButton";
import StatusBadge, { type StatusKind } from "@/components/ui/StatusBadge";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const STATUS_KIND: Record<string, StatusKind> = {
  draft: "planned",
  active: "active",
  signed: "complete",
  completed: "complete",
  voided: "over",
};

export default async function ContractsPage() {
  const supabase = await createClient();

  const { data: contracts } = await supabase
    .from("contracts")
    .select(`
      id, description, amount, status, signed_date, created_at,
      projects ( id, name ),
      vendors ( id, name ),
      cost_codes ( code, name )
    `)
    .order("created_at", { ascending: false });

  const total = (contracts ?? []).reduce((s, c) => s + (c.amount ?? 0), 0);

  return (
    <>
      <Header title="Contracts" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                {(contracts ?? []).length} contract{(contracts ?? []).length !== 1 ? "s" : ""} · {fmt(total)} total committed
              </p>
            </div>
            <Link
              href="/contracts/new"
              className="flex items-center gap-1.5 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
            >
              <Plus size={15} />
              New Contract
            </Link>
          </div>

          {(contracts ?? []).length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <FileText size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium mb-1">No contracts yet</p>
              <p className="text-sm text-gray-400 mb-4">Contracts track committed amounts per project and cost code.</p>
              <Link
                href="/contracts/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
              >
                <Plus size={14} />
                Create First Contract
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Description</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Project</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Vendor</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Cost Code</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Signed</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(contracts ?? []).map((c) => {
                    const project = c.projects as { id: string; name: string } | null;
                    const vendor = c.vendors as { id: string; name: string } | null;
                    const costCode = c.cost_codes as { code: string; name: string } | null;
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-5 py-3 font-medium text-gray-900">{c.description}</td>
                        <td className="px-5 py-3 text-gray-600">
                          {project ? (
                            <Link href={`/projects/${project.id}`} className="hover:text-[#4272EF] transition-colors">
                              {project.name}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{vendor?.name ?? "—"}</td>
                        <td className="px-5 py-3 text-xs text-gray-500 font-mono">{costCode ? `${costCode.code}` : "—"}</td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">{fmt(c.amount ?? 0)}</td>
                        <td className="px-5 py-3">
                          <StatusBadge status={STATUS_KIND[c.status] ?? "neutral"} size="sm">
                            {c.status}
                          </StatusBadge>
                        </td>
                        <td className="px-5 py-3 text-gray-500">{c.signed_date ?? "—"}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link href={`/contracts/${c.id}/edit`} className="p-1.5 text-gray-400 hover:text-[#4272EF] transition-colors rounded-lg hover:bg-blue-50">
                              <Pencil size={14} />
                            </Link>
                            <DeleteContractButton contractId={c.id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td colSpan={4} className="px-5 py-3 text-xs font-semibold text-gray-600 uppercase">Total Committed</td>
                    <td className="px-5 py-3 text-right text-sm font-bold text-gray-900">{fmt(total)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
