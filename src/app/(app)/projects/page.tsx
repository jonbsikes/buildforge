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
  Hammer,
} from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import ProjectCard from "@/components/dashboard/ProjectCard";
import Money from "@/components/ui/Money";
import DateValue from "@/components/ui/DateValue";


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
      .select(
        "id, name, status, project_type, subdivision, start_date, address, block, lot, plan, home_size_sf, size_acres, number_of_lots",
      )
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

  const isComplete = (status: string) => status === "complete" || status === "completed";
  const delayedStageRows = (buildStages ?? []).filter(
    (s) => !isComplete(s.status) && s.status !== "skipped" && s.planned_end_date && s.planned_end_date < today
  );
  const delayedStages = delayedStageRows.length;
  const delayedProjectIds = new Set(delayedStageRows.map((s) => s.project_id).filter(Boolean));
  const delayedProjectCount = delayedProjectIds.size;
  const openTodos = (fieldTodos ?? []).length;
  const urgentTodos = (fieldTodos ?? []).filter((t) => t.priority === "urgent").length;

  // Total budget retained for attention-hero computations; total spent intentionally omitted.
  const totalBudget = (pccRows ?? []).reduce((s, r) => s + (r.budgeted_amount ?? 0), 0);

  const projectNames: Record<string, string> = {};
  for (const p of allProjects) projectNames[p.id] = p.name;

  // Per-project aggregates for the compact "Active projects" list
  const budgetByProject = new Map<string, number>();
  for (const r of pccRows ?? []) {
    if (!r.project_id) continue;
    budgetByProject.set(r.project_id, (budgetByProject.get(r.project_id) ?? 0) + (r.budgeted_amount ?? 0));
  }
  const spentByProject = new Map<string, number>();
  for (const inv of invoices ?? []) {
    if (!inv.project_id) continue;
    spentByProject.set(inv.project_id, (spentByProject.get(inv.project_id) ?? 0) + (inv.total_amount ?? inv.amount ?? 0));
  }
  const stagesByProject = new Map<string, typeof buildStages>();
  for (const s of buildStages ?? []) {
    if (!s.project_id) continue;
    const arr = stagesByProject.get(s.project_id) ?? [];
    arr.push(s);
    stagesByProject.set(s.project_id, arr);
  }

  // Over-budget projects (project-level attention)
  const overBudgetDetail = allProjects
    .map((p) => {
      const budget = budgetByProject.get(p.id) ?? 0;
      const spent = spentByProject.get(p.id) ?? 0;
      return { id: p.id, name: p.name, budget, spent, delta: spent - budget, pct: budget > 0 ? Math.round((spent / budget) * 100) : 0 };
    })
    .filter((r) => r.budget > 0 && r.spent > r.budget)
    .sort((a, b) => b.delta - a.delta);

  const firstDelayedName = (() => {
    const id = [...delayedProjectIds][0];
    return id ? projectNames[id] ?? null : null;
  })();

  const attentionCount = overBudgetDetail.length + delayedProjectCount + urgentTodos;

  const activeProjectsCompact = allProjects
    .filter((p) => p.status === "active")
    .slice(0, 6)
    .map((p) => {
      const stages = stagesByProject.get(p.id) ?? [];
      const activeStages = stages.filter((s) => s.status !== "skipped");
      const total = activeStages.length;
      const complete = activeStages.filter((s) => isComplete(s.status)).length;
      const progress = total > 0 ? Math.round((complete / total) * 100) : 0;
      const current =
        stages.find((s) => s.status === "in_progress") ??
        stages.find((s) => !isComplete(s.status) && s.status !== "skipped") ??
        null;
      return {
        project: p,
        currentStage: current
          ? {
              stage_name: current.stage_name ?? "",
              status: current.status ?? "",
              planned_end_date: current.planned_end_date ?? null,
            }
          : null,
        progress,
        budget: budgetByProject.get(p.id) ?? 0,
        spent: spentByProject.get(p.id) ?? 0,
      };
    });

  // Recent stage activity
  const recentStageActivity = (buildStages ?? [])
    .filter(
      (s) =>
        (s.status === "in_progress" ||
        (!isComplete(s.status) && s.planned_end_date && s.planned_end_date < today)) &&
        s.status !== "skipped"
    )
    .slice(0, 5);

  // Per UI Review § 00 #2: nav and report cards drop decorative color.
  const navCards = [
    {
      href: "/projects/tree",
      icon: FolderOpen,
      label: "All Projects",
      description: `${activeCount} active, ${preConCount} pre-construction`,
    },
    {
      href: "/todos",
      icon: ClipboardList,
      label: "To-Do List",
      description: urgentTodos > 0 ? `${openTodos} open, ${urgentTodos} urgent` : `${openTodos} open`,
      tone: urgentTodos > 0 ? "over" : undefined,
    },
    {
      href: "/field-logs",
      icon: FileText,
      label: "Field Logs",
      description: `${(recentLogs ?? []).length} recent entries`,
    },
  ] as const;

  const reportCards = [
    { href: "/reports/stage-progress", icon: ListChecks, label: "Stage Progress" },
    { href: "/reports/gantt", icon: GanttChart, label: "Gantt Report" },
    { href: "/reports/job-cost", icon: BarChart3, label: "Job Cost" },
    { href: "/reports/budget-variance", icon: TrendingUp, label: "Budget Variance" },
    { href: "/reports/selections", icon: ListChecks, label: "Selections" },
  ];

  return (
    <>
      <Header title="Projects" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {/* ── Needs Attention hero (project-level only) ── */}
        {attentionCount > 0 && (
          <div
            className="rounded-xl px-5 py-4 mb-6 text-white"
            style={{ backgroundColor: "#0F172A" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={13} style={{ color: "var(--status-warning)" }} />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "var(--status-warning)" }}
              >
                Needs Attention · {attentionCount}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {overBudgetDetail.length > 0 && (
                <Link
                  href={`/projects/${overBudgetDetail[0]!.id}`}
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-over)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {overBudgetDetail.length === 1
                        ? `${overBudgetDetail[0]!.name} over budget`
                        : `${overBudgetDetail.length} projects over budget`}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      <Money value={overBudgetDetail[0]!.delta} showSign className="text-slate-400" /> ({overBudgetDetail[0]!.pct}%)
                      {overBudgetDetail.length > 1 && (
                        <span className="text-slate-500"> · +{overBudgetDetail.length - 1} more</span>
                      )}
                    </p>
                  </div>
                </Link>
              )}
              {delayedProjectCount > 0 && (
                <Link
                  href="/reports/stage-progress"
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-delayed)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {delayedProjectCount === 1 && firstDelayedName
                        ? `${firstDelayedName} delayed`
                        : `${delayedProjectCount} project${delayedProjectCount !== 1 ? "s" : ""} delayed`}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {delayedStages} stage deadline{delayedStages !== 1 ? "s" : ""} missed
                    </p>
                  </div>
                </Link>
              )}
              {urgentTodos > 0 && (
                <Link
                  href="/todos"
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-over)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {urgentTodos} urgent to-do{urgentTodos !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {openTodos} open total
                    </p>
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ── Inline secondary metrics (no total spent) ── */}
        <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4 mb-6 border-b border-gray-200">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 tabular-nums">
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Home</p>
              <p className="text-lg font-bold text-gray-900 leading-none mt-1">{homeCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Land Dev</p>
              <p className="text-lg font-bold text-gray-900 leading-none mt-1">{landCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Delayed projects</p>
              <p
                className="text-lg font-bold leading-none mt-1"
                style={{ color: delayedProjectCount > 0 ? "var(--status-delayed)" : undefined }}
              >
                {delayedProjectCount}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Open to-dos</p>
              <p className="text-lg font-bold text-gray-900 leading-none mt-1">{openTodos}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Active budget</p>
              <p className="text-lg font-bold text-gray-900 leading-none mt-1">
                <Money value={totalBudget} />
              </p>
            </div>
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
                  const isOver = (card as { tone?: string }).tone === "over";
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-400 transition-colors group"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-[color:var(--neutral-chip-bg)] text-[color:var(--neutral-chip-fg)]"
                      >
                        <Icon size={20} />
                      </div>
                      <p className="font-semibold text-gray-900 mb-0.5 group-hover:text-[#4272EF] transition-colors">
                        {card.label}
                        {isOver && (
                          <span className="ml-2 align-middle inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "var(--status-over)" }} />
                        )}
                      </p>
                      <p className="text-xs text-gray-500">{card.description}</p>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Reports */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Reports</h2>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                {reportCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[color:var(--neutral-chip-bg)] text-[color:var(--neutral-chip-fg)]">
                        <Icon size={16} />
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
            {/* Active Projects (compact) */}
            {activeProjectsCompact.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Projects</h2>
                  <Link href="/projects/tree" className="text-xs font-medium text-[#4272EF]">View tree</Link>
                </div>
                <div className="space-y-2">
                  {activeProjectsCompact.map((row) => (
                    <ProjectCard
                      key={row.project.id}
                      project={row.project}
                      currentStage={row.currentStage}
                      nextStage={null}
                      progress={row.progress}
                      budget={row.budget}
                      spent={row.spent}
                      todoCount={0}
                      variant="compact"
                    />
                  ))}
                </div>
              </div>
            )}

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
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            s.status !== "in_progress"
                              ? "var(--status-delayed)"
                              : "var(--status-active)",
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.stage_name}</p>
                        <p className="text-xs text-gray-400">{projectNames[s.project_id] ?? "Unknown"}</p>
                      </div>
                      {s.status !== "in_progress" && (
                        <StatusBadge status="delayed" size="sm">Delayed</StatusBadge>
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
                        <span className="text-xs text-gray-400">
                          <DateValue value={log.log_date} kind="smart" className="text-gray-400" />
                        </span>
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
