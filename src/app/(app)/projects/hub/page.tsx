import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import {
  FolderOpen,
  ClipboardList,
  FileText,
  BarChart3,
  TrendingUp,
  GanttChart,
  ListChecks,
  AlertTriangle,
  ChevronRight,
  HardHat,
  TreePine,
  Calendar,
  Hammer,
} from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default async function ProjectsHubPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0]!;

  const [
    { data: projects },
    { data: pccRows },
    { data: invoices },
    { data: fieldTodos },
    { data: buildStages },
    { data: recentLogs },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, status, project_type, subdivision, start_date")
      .in("status", ["active", "pre_construction"])
      .order("created_at", { ascending: false }),
    supabase.from("project_cost_codes").select("project_id, budgeted_amount"),
    supabase
      .from("invoices")
      .select("id, status, amount, total_amount, project_id")
      .in("status", ["approved", "released", "cleared"]),
    supabase
      .from("field_todos")
      .select("id, status, priority, project_id, due_date")
      .neq("status", "done"),
    supabase
      .from("build_stages")
      .select("id, project_id, stage_name, status, planned_end_date, actual_start_date, actual_end_date, stage_number")
      .order("stage_number", { ascending: true }),
    supabase
      .from("field_logs")
      .select("id, log_date, notes, project_id")
      .order("log_date", { ascending: false })
      .limit(5),
  ]);

  const allProjects = projects ?? [];
  const activeCount = allProjects.filter((p) => p.status === "active").length;
  const preConCount = allProjects.filter((p) => p.status === "pre_construction").length;
  const homeCount = allProjects.filter((p) => p.project_type === "home_construction").length;
  const landCount = allProjects.filter((p) => p.project_type === "land_development").length;

  const delayedStages = (buildStages ?? []).filter(
    (s) => s.status !== "completed" && s.planned_end_date && s.planned_end_date < today
  ).length;
  const openTodos = (fieldTodos ?? []).length;
  const urgentTodos = (fieldTodos ?? []).filter((t) => t.priority === "urgent").length;

  // Budget vs actual
  const totalBudget = (pccRows ?? []).reduce((s, r) => s + (r.budgeted_amount ?? 0), 0);
  const totalActual = (invoices ?? []).reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);

  const projectNames: Record<string, string> = {};
  for (const p of allProjects) projectNames[p.id] = p.name;

  // Recent stage activity
  const recentStageActivity = (buildStages ?? [])
    .filter(
      (s) =>
        s.status === "in_progress" ||
        (s.status !== "completed" && s.planned_end_date && s.planned_end_date < today)
    )
    .slice(0, 5);

  const navCards = [
    {
      href: "/projects",
      icon: FolderOpen,
      label: "All Projects",
      description: `${activeCount} active, ${preConCount} pre-construction`,
      color: "text-[#4272EF]",
      bg: "bg-blue-50",
    },
    {
      href: "/todos",
      icon: ClipboardList,
      label: "To-Do List",
      description: urgentTodos > 0 ? `${openTodos} open, ${urgentTodos} urgent` : `${openTodos} open`,
      color: urgentTodos > 0 ? "text-red-600" : "text-purple-600",
      bg: urgentTodos > 0 ? "bg-red-50" : "bg-purple-50",
    },
    {
      href: "/field-logs",
      icon: FileText,
      label: "Field Logs",
      description: `${(recentLogs ?? []).length} recent entries`,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ];

  const reportCards = [
    { href: "/reports/stage-progress", icon: ListChecks, label: "Stage Progress", color: "text-[#4272EF]", bg: "bg-blue-50" },
    { href: "/reports/gantt", icon: GanttChart, label: "Gantt Report", color: "text-indigo-600", bg: "bg-indigo-50" },
    { href: "/reports/job-cost", icon: BarChart3, label: "Job Cost", color: "text-emerald-600", bg: "bg-emerald-50" },
    { href: "/reports/budget-variance", icon: TrendingUp, label: "Budget Variance", color: "text-amber-600", bg: "bg-amber-50" },
    { href: "/reports/selections", icon: ListChecks, label: "Selections", color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <>
      <Header title="Projects" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <HardHat size={18} className="text-[#4272EF]" />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 tabular-nums">{homeCount}</p>
            <p className="text-xs lg:text-sm text-gray-500">Home Construction</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TreePine size={18} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 tabular-nums">{landCount}</p>
            <p className="text-xs lg:text-sm text-gray-500">Land Development</p>
          </div>
          <div className={`bg-white border rounded-xl p-4 lg:p-5 shadow-sm ${delayedStages > 0 ? "border-amber-200" : "border-gray-200"}`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center ${delayedStages > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
                <AlertTriangle size={18} className={delayedStages > 0 ? "text-amber-600" : "text-gray-400"} />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 tabular-nums">{delayedStages}</p>
            <p className="text-xs lg:text-sm text-gray-500">Delayed Stages</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                <BarChart3 size={18} className="text-gray-600" />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 tabular-nums">{fmt(totalActual)}</p>
            <p className="text-xs lg:text-sm text-gray-500">of {fmt(totalBudget)} spent</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Nav Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Main Navigation */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Navigate</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {navCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all group"
                    >
                      <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                        <Icon size={20} className={card.color} />
                      </div>
                      <p className="font-semibold text-gray-900 mb-0.5 group-hover:text-[#4272EF] transition-colors">{card.label}</p>
                      <p className="text-xs text-gray-500">{card.description}</p>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Reports */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Reports</h2>
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
                {reportCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                        <Icon size={16} className={card.color} />
                      </div>
                      <span className="text-sm font-medium text-gray-700 flex-1">{card.label}</span>
                      <ChevronRight size={16} className="text-gray-300" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Recent Activity */}
          <div className="space-y-4">
            {/* Active Stages */}
            {recentStageActivity.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Hammer size={16} className="text-[#4272EF]" />
                  <h2 className="font-bold text-gray-900">Active Stages</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {recentStageActivity.map((s) => (
                    <Link
                      key={s.id}
                      href={`/projects/${s.project_id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${s.status !== "in_progress" ? "bg-amber-500" : "bg-[#4272EF]"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.stage_name}</p>
                        <p className="text-xs text-gray-400">{projectNames[s.project_id] ?? "Unknown"}</p>
                      </div>
                      {s.status !== "in_progress" && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Delayed</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Field Logs */}
            {(recentLogs ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Recent Field Logs</h2>
                  <Link href="/field-logs" className="text-sm font-medium text-[#4272EF]">View all</Link>
                </div>
                <div className="divide-y divide-gray-50">
                  {(recentLogs ?? []).map((log) => (
                    <div key={log.id} className="px-5 py-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-[#4272EF]">{projectNames[log.project_id] ?? "—"}</span>
                        <span className="text-xs text-gray-400">{fmtDate(log.log_date)}</span>
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-2">{log.notes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Open To-Dos summary */}
            {openTodos > 0 && (
              <Link href="/todos" className="block bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${urgentTodos > 0 ? "bg-red-50" : "bg-purple-50"}`}>
                    <ClipboardList size={20} className={urgentTodos > 0 ? "text-red-500" : "text-purple-600"} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900 tabular-nums">{openTodos} open to-do{openTodos !== 1 ? "s" : ""}</p>
                    {urgentTodos > 0 && <p className="text-xs text-red-500 font-medium">{urgentTodos} urgent</p>}
                  </div>
                  <ChevronRight size={16} className="text-gray-300 ml-auto" />
                </div>
              </Link>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
