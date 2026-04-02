// @ts-nocheck
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import type { Database } from "@/types/database";

type CostCode = Database["public"]["Tables"]["cost_codes"]["Row"];

export default function CostCodesClient({ costCodes }: { costCodes: CostCode[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = costCodes.filter((c) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "land" && c.category === "Land Development") ||
      (filter === "home" && c.category === "Home Construction");
    const matchesSearch =
      !search ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      String(c.code).includes(search);
    return matchesFilter && matchesSearch;
  });

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Settings
        </Link>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
          These 102 cost codes are the master list for the app. They are read-only and cannot be edited.
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: "all", label: "All (102)" },
                { key: "land", label: "Land Dev (1–33)" },
                { key: "home", label: "Home Construction (34–102)" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-[180px] relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Search codes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase w-16">Code</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Description</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((code) => (
                  <tr key={code.code} className="hover:bg-gray-50">
                    <td className="px-5 py-2">
                      <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{code.code}</span>
                    </td>
                    <td className="px-5 py-2 text-gray-900">{code.description}</td>
                    <td className="px-5 py-2 text-xs text-gray-500">{code.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
