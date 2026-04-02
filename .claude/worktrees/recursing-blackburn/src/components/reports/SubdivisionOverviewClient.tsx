"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Building2 } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pct(num: number, den: number) {
  if (den === 0) return 0;
  return Math.min(100, Math.max(0, (num / den) * 100));
}

interface HomeData {
  id: string;
  name: string;
  address: string | null;
  status: string;
  plan: string | null;
  lot: string | null;
  block: string | null;
  home_size_sf: number | null;
  budget: number;
  actual: number;
  stageCount: number;
  stagesDone: number;
  currentStage: string | null;
  recentLog: string | null;
  openTodos: number;
}

interface SubdivisionGroup {
  name: string;
  homes: HomeData[];
}

export default function SubdivisionOverviewClient() {
  const [groups, setGroups] = useState<SubdivisionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [projectsRes, budgetsRes, invoicesRes, stagesRes, fieldLogsRes, todosRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, address, status, project_type, subdivision, plan, lot, block, home_size_sf")
          .eq("project_type", "home_construction")
          .not("subdivision", "is", null)
          .order("subdivision")
          .order("name"),
        supabase.from("project_cost_codes").select("project_id, budgeted_amount"),
        supabase.from("invoices").select("project_id, amount, total_amount").in("status", ["approved", "paid"]),
        supabase.from("build_stages").select("project_id, status, stage_name").order("stage_number"),
        supabase.from("field_logs").select("project_id, log_date, notes").order("log_date", { ascending: false }),
        supabase.from("field_todos").select("project_id, status").eq("status", "open"),
      ]);

      const projects = projectsRes.data ?? [];

      const budgetMap: Record<string, number> = {};
      for (const b of budgetsRes.data ?? []) {
        budgetMap[b.project_id] = (budgetMap[b.project_id] ?? 0) + (b.budgeted_amount ?? 0);
      }

      const actualMap: Record<string, number> = {};
      for (const inv of invoicesRes.data ?? []) {
        if (inv.project_id) {
          actualMap[inv.project_id] = (actualMap[inv.project_id] ?? 0) + (inv.total_amount ?? inv.amount ?? 0);
        }
      }

      const stagesByProject: Record<string, typeof stagesRes.data> = {};
      for (const s of stagesRes.data ?? []) {
        if (!stagesByProject[s.project_id]) stagesByProject[s.project_id] = [];
        stagesByProject[s.project_id]!.push(s);
      }

      const latestLogByProject: Record<string, string> = {};
      for (const log of fieldLogsRes.data ?? []) {
        if (!latestLogByProject[log.project_id]) {
          latestLogByProject[log.project_id] = log.notes;
        }
      }

      const openTodosByProject: Record<string, number> = {};
      for (const todo of todosRes.data ?? []) {
        openTodosByProject[todo.project_id] = (openTodosByProject[todo.project_id] ?? 0) + 1;
      }

      const subdivMap: Record<string, HomeData[]> = {};
      for (const p of projects) {
        const stages = stagesByProject[p.id] ?? [];
        const doneStages = stages.filter((s) => s.status === "complete").length;
        const inProgressStage = stages.find((s) => s.status === "in_progress");

        const home: HomeData = {
          id: p.id,
          name: p.name,
          address: p.address,
          status: p.status,
          plan: p.plan,
          lot: p.lot,
          block: p.block,
          home_size_sf: p.home_size_sf,
          budget: budgetMap[p.id] ?? 0,
          actual: actualMap[p.id] ?? 0,
          stageCount: stages.length,
          stagesDone: doneStages,
          currentStage: inProgressStage?.stage_name ?? null,
          recentLog: latestLogByProject[p.id] ?? null,
          openTodos: openTodosByProject[p.id] ?? 0,
        };

        const subdiv = p.subdivision ?? "No Subdivision";
        if (!subdivMap[subdiv]) subdivMap[subdiv] = [];
        subdivMap[subdiv].push(home);
      }

      setGroups(Object.entries(subdivMap).map(([name, homes]) => ({ name, homes })));
      setLoading(false);
    }
    load();
  }, []);

  const filteredGroups = groups.map((g) => ({
    ...g,
    homes: filter ? g.homes.filter((h) => h.status === filter) : g.homes,
  })).filter((g) => g.homes.length > 0);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Filter */}
      <div className="flex items-center gap-3 print:hidden">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          <option value="">All Statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No home construction projects with subdivisions found.
        </div>
      ) : (
        filteredGroups.map((group) => (
          <div key={group.name} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">{group.name}</h2>
              <span className="text-xs text-gray-400">{group.homes.length} home{group.homes.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.homes.map((home) => {
                const stagePct = pct(home.stagesDone, home.stageCount);
                const budgetPct = pct(home.actual, home.budget);
                const overBudget = home.budget > 0 && home.actual > home.budget;

                return (
                  <Link
                    key={home.id}
                    href={`/projects/${home.id}`}
                    className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-[#4272EF] hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                          <Building2 size={14} className="text-[#4272EF]" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 leading-tight">{home.name}</p>
                          {(home.block || home.lot) && (
                            <p className="text-xs text-gray-400">Block {home.block} / Lot {home.lot}</p>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        home.status === "active" ? "bg-green-100 text-green-700" :
                        home.status === "planning" ? "bg-gray-100 text-gray-600" :
                        home.status === "on_hold" ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {home.status.replace(/_/g, " ")}
                      </span>
                    </div>

                    {/* Stage progress */}
                    {home.stageCount > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                          <span>{home.currentStage ?? "No active stage"}</span>
                          <span>{home.stagesDone}/{home.stageCount} stages</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#4272EF] rounded-full"
                            style={{ width: `${stagePct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Budget status */}
                    {home.budget > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-400">Budget</span>
                          <span className={overBudget ? "text-red-600 font-medium" : "text-gray-600"}>
                            {fmt(home.actual)} / {fmt(home.budget)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${overBudget ? "bg-red-400" : budgetPct >= 80 ? "bg-amber-400" : "bg-green-400"}`}
                            style={{ width: `${Math.min(100, budgetPct)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Metadata row */}
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {home.home_size_sf != null && <span>{home.home_size_sf.toLocaleString()} SF</span>}
                      {home.plan && <span>Plan: {home.plan}</span>}
                      {home.openTodos > 0 && (
                        <span className="text-amber-600 font-medium ml-auto">{home.openTodos} open todo{home.openTodos !== 1 ? "s" : ""}</span>
                      )}
                    </div>

                    {/* Recent field log */}
                    {home.recentLog && (
                      <p className="text-xs text-gray-400 mt-2 line-clamp-2 border-t border-gray-50 pt-2">
                        {home.recentLog}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
