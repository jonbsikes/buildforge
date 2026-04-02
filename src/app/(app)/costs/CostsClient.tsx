"use client";

import { useState, useMemo } from "react";
import { DollarSign } from "lucide-react";
import type { Database } from "@/types/database";

type Project = Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name">;
type Stage = Pick<Database["public"]["Tables"]["stages"]["Row"], "id" | "name" | "project_id">;
type CostItem = Database["public"]["Tables"]["cost_items"]["Row"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

const CATEGORIES = [
  "land","siteworks","foundation","framing","roofing","electrical","plumbing",
  "hvac","insulation","drywall","flooring","cabinetry","painting","landscaping",
  "permits","professional_fees","contingency","other",
];

export default function CostsClient({
  projects,
  costItems,
  stages,
}: {
  projects: Project[];
  costItems: CostItem[];
  stages: Stage[];
}) {
  const [filterProject, setFilterProject] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return costItems.filter((item) => {
      if (filterProject !== "all" && item.project_id !== filterProject) return false;
      if (filterCategory !== "all" && item.category !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !item.description.toLowerCase().includes(q) &&
          !(item.vendor ?? "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [costItems, filterProject, filterCategory, search]);

  const totalBudgeted = filtered.reduce((s, c) => s + c.budgeted_amount, 0);
  const totalActual = filtered.reduce((s, c) => s + c.actual_amount, 0);
  const variance = totalBudgeted - totalActual;

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const stageMap = Object.fromEntries(stages.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Budgeted (filtered)</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalBudgeted)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Actual Spend</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalActual)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Variance</p>
          <p className={`text-xl font-bold ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
            {variance >= 0 ? "+" : ""}{fmt(variance)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search description or vendor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] w-64"
        />
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="all">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
          ))}
        </select>
        {(filterProject !== "all" || filterCategory !== "all" || search) && (
          <button
            onClick={() => { setFilterProject("all"); setFilterCategory("all"); setSearch(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <DollarSign size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {costItems.length === 0
              ? "No cost items yet. Add them from a project."
              : "No items match the current filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Stage</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Budgeted</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actual</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((item) => {
                const v = item.budgeted_amount - item.actual_amount;
                return (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900 max-w-xs truncate">{item.description}</td>
                    <td className="px-4 py-3">
                      <a
                        href={`/projects/${item.project_id}`}
                        className="hover:underline text-xs"
                      >
                        {projectMap[item.project_id] ?? "—"}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {item.stage_id ? (stageMap[item.stage_id] ?? "—") : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize text-xs">{item.category.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{item.vendor ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(item.budgeted_amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(item.actual_amount)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${v >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {v >= 0 ? "+" : ""}{fmt(v)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                <td colSpan={5} className="px-4 py-3 text-xs text-gray-500 uppercase">Total ({filtered.length} items)</td>
                <td className="px-4 py-3 text-right text-gray-900">{fmt(totalBudgeted)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{fmt(totalActual)}</td>
                <td className={`px-4 py-3 text-right ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {variance >= 0 ? "+" : ""}{fmt(variance)}
                </td>
              </tr>
            </tfoot>
          </table>
  