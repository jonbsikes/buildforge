import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, DollarSign } from "lucide-react";
import type { Database } from "@/types/database";

type CostItem = Database["public"]["Tables"]["cost_items"]["Row"];
type Project = Database["public"]["Tables"]["projects"]["Row"];

const categoryColors: Record<string, string> = {
  land: "bg-emerald-100 text-emerald-700",
  siteworks: "bg-orange-100 text-orange-700",
  foundation: "bg-stone-100 text-stone-700",
  framing: "bg-amber-100 text-amber-700",
  roofing: "bg-red-100 text-red-700",
  electrical: "bg-yellow-100 text-yellow-700",
  plumbing: "bg-blue-100 text-blue-700",
  hvac: "bg-cyan-100 text-cyan-700",
  insulation: "bg-lime-100 text-lime-700",
  drywall: "bg-gray-100 text-gray-600",
  flooring: "bg-teal-100 text-teal-700",
  cabinetry: "bg-violet-100 text-violet-700",
  painting: "bg-pink-100 text-pink-700",
  landscaping: "bg-green-100 text-green-700",
  permits: "bg-indigo-100 text-indigo-700",
  professional_fees: "bg-purple-100 text-purple-700",
  contingency: "bg-rose-100 text-rose-700",
  other: "bg-gray-100 text-gray-600",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function CostsPage() {
  const supabase = await createClient();

  const [costItemsResult, projectsResult] = await Promise.all([
    supabase.from("cost_items").select("*").order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name"),
  ]);

  const costItems = (costItemsResult.data ?? []) as CostItem[];
  const projects = (projectsResult.data ?? []) as Pick<Project, "id" | "name">[];
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const totalBudgeted = costItems.reduce((s, c) => s + c.budgeted_amount, 0);
  const totalActual = costItems.reduce((s, c) => s + c.actual_amount, 0);
  const variance = totalBudgeted - totalActual;

  // Group by category for summary
  const byCategory = costItems.reduce<Record<string, { budgeted: number; actual: number }>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = { budgeted: 0, actual: 0 };
    acc[item.category].budgeted += item.budgeted_amount;
    acc[item.category].actual += item.actual_amount;
    return acc;
  }, {});

  return (
    <>
      <Header title="Cost Tracking" />
      <main className="flex-1 p-6 overflow-auto">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Budgeted", value: formatCurrency(totalBudgeted), color: "text-gray-900" },
            { label: "Total Actual", value: formatCurrency(totalActual), color: "text-gray-900" },
            {
              label: variance >= 0 ? "Under Budget" : "Over Budget",
              value: formatCurrency(Math.abs(variance)),
              color: variance >= 0 ? "text-emerald-600" : "text-red-600",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Category breakdown */}
          {Object.keys(byCategory).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">By Category</h2>
              <div className="space-y-3">
                {Object.entries(byCategory)
                  .sort((a, b) => b[1].actual - a[1].actual)
                  .map(([cat, { budgeted, actual }]) => {
                    const pct = budgeted > 0 ? Math.min((actual / budgeted) * 100, 100) : 0;
                    const over = actual > budgeted;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${categoryColors[cat] ?? "bg-gray-100 text-gray-600"}`}>
                            {cat.replace(/_/g, " ")}
                          </span>
                          <span className={`text-xs font-medium ${over ? "text-red-600" : "text-gray-500"}`}>
                            {formatCurrency(actual)} / {formatCurrency(budgeted)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${over ? "bg-red-400" : "bg-blue-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Cost items table */}
          <div className={`bg-white rounded-xl border border-gray-200 ${Object.keys(byCategory).length > 0 ? "xl:col-span-2" : "xl:col-span-3"}`}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">All Cost Items</h2>
              <Link
                href="/costs/new"
                className="inline-flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={14} />
                Add Cost
              </Link>
            </div>

            {costItems.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <DollarSign size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No cost items yet.</p>
                <Link href="/costs/new" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
                  Add the first cost item
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Description</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Project</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Category</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Budgeted</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Actual</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {costItems.map((item) => {
                      const v = item.budgeted_amount - item.actual_amount;
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-medium text-gray-900">{item.description}</div>
                            {item.vendor && <div className="text-xs text-gray-400">{item.vendor}</div>}
                          </td>
                          <td className="px-5 py-3 text-gray-500 text-xs">
                            {projectMap[item.project_id] ?? "—"}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${categoryColors[item.category] ?? "bg-gray-100 text-gray-600"}`}>
                              {item.category.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(item.budgeted_amount)}</td>
                          <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(item.actual_amount)}</td>
                          <td className={`px-5 py-3 text-right font-medium ${v >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {v < 0 ? "-" : ""}{formatCurrency(Math.abs(v))}
                          </td>
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
