import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ProjectCard from "@/components/dashboard/ProjectCard";
import type { StageStripStage } from "@/components/ui/StageStrip";
import Link from "next/link";
import {
  FolderOpen,
  AlertTriangle,
  ClipboardList,
  Calendar,
  Hammer,
  ArrowRight,
  Plus,
} from "lucide-react";
import Money from "@/components/ui/Money";


function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0]!;
  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const weekStr = weekFromNow.toISOString().split("T")[0]!;

  const [
    { data: projects },
    { data: pccRows },
    { data: invoices },
    { data: vendors },
    { data: fieldTodos },
    { data: buildStages },
    { data: draws },
  ] = await Promise.all([
    supabase.from("projects").select("id, name, status, project_type, subdivision, address, start_date, block, lot, plan, home_size_sf, size_acres, number_of_lots").in("status", ["active", "pre_construction"]).order("created_at", { ascending: false }),
    supabase.from("project_cost_codes").select("project_id, budgeted_amount"),
    supabase.from("invoices").select("id, status, amount, total_amount, due_date, project_id, vendor, invoice_number, invoice_line_items ( project_id, amount )"),
    supabase.from("vendors").select("id, name, coi_expiry_date, license_expiry_date"),
    supabase.from("field_todos").select("id, status, priority, description, project_id, due_date").neq("status", "done"),
    supabase.from("build_stages").select("id, project_id, stage_name, stage_number, status, track, planned_start_date, planned_end_date, actual_start_date, actual_end_date").order("stage_number", { ascending: true }),
    supabase.from("loan_draws").select("id, status"),
  ]);

  const allProjects = projects ?? [];
  const activeCount = allProjects.filter((p) => p.status === "active").length;

  const budgetByProject: Record<string, number> = {};
  for (const pcc of pccRows ?? []) if (pcc.project_id) budgetByProject[pcc.project_id] = (budgetByProject[pcc.project_id] ?? 0) + (pcc.budgeted_amount ?? 0);

  const actualByProject: Record<string, number> = {};
  for (const inv of (invoices ?? []).filter((i) => i.status === "approved" || i.status === "released" || i.status === "cleared")) {
    const lineItems = (inv as { invoice_line_items: { project_id: string | null; amount: number }[] | null }).invoice_line_items;
    if (lineItems && lineItems.length > 0) {
      for (const li of lineItems) {
        if (li.project_id) actualByProject[li.project_id] = (actualByProject[li.project_id] ?? 0) + (li.amount ?? 0);
      }
    } else if (inv.project_id) {
      actualByProject[inv.project_id] = (actualByProject[inv.project_id] ?? 0) + (inv.total_amount ?? inv.amount ?? 0);
    }
  }

  const todosByProject: Record<string, number> = {};
  for (const t of fieldTodos ?? []) {
    if (t.project_id) todosByProject[t.project_id] = (todosByProject[t.project_id] ?? 0) + 1;
  }
  const openTodos = (fieldTodos ?? []).length;

  const stagesByProject: Record<string, NonNullable<typeof buildStages>> = {};
  for (const s of buildStages ?? []) {
    if (!stagesByProject[s.project_id]) stagesByProject[s.project_id] = [];
    stagesByProject[s.project_id]!.push(s);
  }

  function getCurrentStage(pid: string) {
    const st = stagesByProject[pid] ?? [];
    return st.find((s) => s.status === "in_progress") ?? st.find((s) => s.status === "delayed") ?? st.find((s) => s.status === "not_started") ?? null;
  }
  function getStageProgress(pid: string) {
    const active = (stagesByProject[pid] ?? []).filter((s) => s.status !== "skipped");
    return active.length === 0
      ? 0
      : Math.round(
          (active.filter((s) => s.status === "complete" || s.status === "completed").length /
            active.length) *
            100,
        );
  }
  function getNextStage(pid: string) {
    const st = stagesByProject[pid] ?? [];
    const cur = getCurrentStage(pid);
    return cur ? st.find((s) => s.stage_number > cur.stage_number && s.status === "not_started") ?? null : null;
  }

  function getDelayedStageDays(pid: string): { stage: string; days: number } | null {
    const st = stagesByProject[pid] ?? [];
    for (const s of st) {
      if (s.status === "complete" || s.status === "skipped") continue;
      if (s.planned_end_date && s.planned_end_date < today) {
        const days = Math.floor(
          (Date.now() - new Date(s.planned_end_date + "T00:00:00").getTime()) / 86400000,
        );
        return { stage: s.stage_name ?? "Stage", days };
      }
    }
    return null;
  }

  // Build stage strip data for each project.
  // Home construction: EXT + INT tracks. Land Development: single WORK track
  // (no EXT/INT — land dev stages are horizontal work only).
  function getStageStripData(pid: string, projectType: string) {
    const stages = stagesByProject[pid] ?? [];
    const isLandDev = projectType === "land_development";

    function toStrip(s: (typeof stages)[number], status: string): StageStripStage {
      return {
        name: s.stage_name,
        status,
        date: s.actual_start_date ? fmtDate(s.actual_start_date) : null,
        startDate: s.actual_start_date ?? s.planned_start_date ?? null,
        endDate: s.actual_end_date ?? s.planned_end_date ?? null,
        stageNumber: s.stage_number,
      };
    }
    function buildStrip(trackStages: typeof stages): StageStripStage[] {
      const result: StageStripStage[] = [];
      const lastComplete = [...trackStages].reverse().find((s) => s.status === "complete");
      const inProgress = trackStages.find((s) => s.status === "in_progress" || s.status === "delayed");
      const nextUp = trackStages.find((s) => s.status === "not_started");
      const secondNext = nextUp ? trackStages.find((s) => s.stage_number > nextUp.stage_number && s.status === "not_started") : null;

      if (lastComplete) result.push(toStrip(lastComplete, "complete"));
      if (inProgress) result.push(toStrip(inProgress, inProgress.status));
      if (nextUp) result.push(toStrip(nextUp, "not_started"));
      if (secondNext) result.push(toStrip(secondNext, "not_started"));
      return result;
    }

    const delayed = stages.filter((s) => s.status === "delayed").length;

    if (isLandDev) {
      return { ext: [], int: [], work: buildStrip(stages), delayed };
    }

    const extAll = stages.filter((s) => s.track === "exterior" || !s.track);
    const intAll = stages.filter((s) => s.track === "interior");
    return { ext: buildStrip(extAll), int: buildStrip(intAll), work: [], delayed };
  }

  const pendingInvoices = (invoices ?? []).filter((i) => i.status === "pending_review");
  const pendingReviewAmount = pendingInvoices.reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);
  const pastDueInvoices = (invoices ?? []).filter((i) => i.status !== "released" && i.status !== "cleared" && i.status !== "void" && i.due_date && i.due_date < today);
  const pastDueAmount = pastDueInvoices.reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);
  const outstandingAP = (invoices ?? []).filter((i) => i.status === "approved").reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);

  // AP due this week
  const apThisWeek = (invoices ?? [])
    .filter((i) => i.status !== "cleared" && i.status !== "void")
    .filter((i) => i.due_date && i.due_date >= today && i.due_date <= weekStr)
    .reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);

  // Project "in-flight" total = sum of active project budgets
  const inFlightTotal = allProjects.reduce((s, p) => s + (budgetByProject[p.id] ?? 0), 0);

  const pendingDraws = (draws ?? []).filter((d) => d.status === "submitted" || d.status === "draft").length;

  const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
  const expiringVendors = (vendors ?? []).filter((v) => { const c = daysUntil(v.coi_expiry_date); const l = daysUntil(v.license_expiry_date); return (c !== null && c <= 30) || (l !== null && l <= 30); });
  const overBudgetProjects = allProjects.filter((p) => { const a = actualByProject[p.id] ?? 0; const b = budgetByProject[p.id] ?? 0; return a > b && b > 0; });
  const overBudgetDetail = overBudgetProjects.map((p) => {
    const a = actualByProject[p.id] ?? 0;
    const b = budgetByProject[p.id] ?? 0;
    return { id: p.id, name: p.name, delta: a - b, pct: b > 0 ? Math.round((a / b) * 100) : 0 };
  });
  const expiringVendorNames = expiringVendors.slice(0, 3).map((v) => v.name).join(", ");

  // Counter only — detail list lives on /notifications
  const delayedProjectCount = allProjects.filter((p) => getDelayedStageDays(p.id) !== null).length;
  const attention = {
    length:
      overBudgetProjects.length +
      delayedProjectCount +
      pendingInvoices.length +
      pastDueInvoices.length +
      expiringVendors.length,
  };

  // ─── Risk score for project grid ───
  function riskScore(pid: string): number {
    const actual = actualByProject[pid] ?? 0;
    const budget = budgetByProject[pid] ?? 0;
    const overBudget = budget > 0 && actual > budget ? 3 : 0;
    const stages = stagesByProject[pid] ?? [];
    const delayedStages = stages.filter(
      (s) => s.status !== "complete" && s.status !== "skipped" && s.planned_end_date && s.planned_end_date < today,
    ).length;
    const todos = todosByProject[pid] ?? 0;
    return overBudget + delayedStages * 2 + todos * 0.25;
  }

  const sortedProjects = [...allProjects].sort((a, b) => riskScore(b.id) - riskScore(a.id));

  const thisWeekStages = (buildStages ?? []).filter((s) => {
    const start = s.actual_start_date;
    const end = s.actual_end_date;
    return (start && start >= today && start <= weekStr) || (end && end >= today && end <= weekStr);
  });
  const todosDueThisWeek = (fieldTodos ?? []).filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekStr);
  const hasWeeklyActivity = thisWeekStages.length > 0 || todosDueThisWeek.length > 0;

  const projectNames: Record<string, string> = {};
  for (const p of allProjects) projectNames[p.id] = p.name;

  function cardProps(p: (typeof allProjects)[0]) {
    const strip = getStageStripData(p.id, p.project_type);
    return { project: p, currentStage: getCurrentStage(p.id), nextStage: getNextStage(p.id), progress: getStageProgress(p.id), budget: budgetByProject[p.id] ?? 0, spent: actualByProject[p.id] ?? 0, todoCount: todosByProject[p.id] ?? 0, extStages: strip.ext, intStages: strip.int, workStages: strip.work, delayedCount: strip.delayed };
  }

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">

        {/* ── Needs Attention hero ── */}
        {attention.length > 0 && (
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
                Needs Attention · {attention.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {pastDueInvoices.length > 0 && (
                <Link
                  href="/invoices"
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-over)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {pastDueInvoices.length} past-due invoice{pastDueInvoices.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      <Money value={pastDueAmount} className="text-slate-400" />
                    </p>
                  </div>
                </Link>
              )}
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
              {expiringVendors.length > 0 && (
                <Link
                  href="/vendors"
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-warning)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {expiringVendors.length} COI{expiringVendors.length !== 1 ? "s" : ""} expire &lt;30d
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{expiringVendorNames}</p>
                  </div>
                </Link>
              )}
              {pendingInvoices.length > 0 && (
                <Link
                  href="/invoices"
                  className="flex items-start gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ backgroundColor: "var(--status-warning)" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {pendingInvoices.length} invoice{pendingInvoices.length !== 1 ? "s" : ""} to review
                    </p>
                    <p className="text-[11px] text-slate-400">
                      <Money value={pendingReviewAmount} className="text-slate-400" />
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
                    <p className="text-sm font-medium text-white">
                      {delayedProjectCount} project{delayedProjectCount !== 1 ? "s" : ""} delayed
                    </p>
                    <p className="text-[11px] text-slate-400">Stage deadline missed</p>
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ── Inline secondary metrics strip ── */}
        <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4 mb-6 border-b border-gray-200">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 tabular-nums">
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Active</p>
              <p className="text-lg font-bold text-gray-900 leading-none mt-1">{activeCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">AP out</p>
              <p className="text-lg font-bold leading-none mt-1">
                <Money value={outstandingAP} />
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">AP this week</p>
              <p className="text-lg font-bold leading-none mt-1">
                <Money value={apThisWeek} />
              </p>
            </div>
            <div title="Sum of budgets across active projects">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Active budget</p>
              <p className="text-lg font-bold leading-none mt-1">
                <Money value={inFlightTotal} />
              </p>
            </div>
            {pendingDraws > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Draws pending</p>
                <p className="text-lg font-bold text-gray-900 leading-none mt-1">{pendingDraws}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">This week</p>
              <p className="text-sm font-semibold text-gray-700 leading-none mt-1.5">
                {thisWeekStages.filter((s) => s.actual_start_date && s.actual_start_date >= today && s.actual_start_date <= weekStr).length} start
                {" · "}
                {thisWeekStages.filter((s) => s.actual_end_date && s.actual_end_date >= today && s.actual_end_date <= weekStr).length} complete
              </p>
            </div>
          </div>
          <Link
            href="/projects/new"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border border-[color:var(--card-border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus size={13} /> New Project
          </Link>
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">

            {/* Active Projects */}
            {sortedProjects.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
                <FolderOpen size={48} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-4">No active projects yet.</p>
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg hover:opacity-90"
                  style={{ backgroundColor: "var(--brand-blue)" }}
                >
                  Create your first project <ArrowRight size={14} />
                </Link>
              </div>
            ) : (
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Active Projects · sorted by risk
                  </h3>
                  <Link
                    href="/projects"
                    className="text-xs font-medium"
                    style={{ color: "var(--brand-blue)" }}
                  >
                    View tree →
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sortedProjects.map((p) => <ProjectCard key={p.id} {...cardProps(p)} />)}
                </div>
              </div>
            )}

            {/* This Week */}
            {hasWeeklyActivity && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Calendar size={16} style={{ color: "var(--brand-blue)" }} />
                  <h2 className="font-bold text-gray-900">This Week</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {thisWeekStages.slice(0, 6).map((s) => {
                    const isStart = s.actual_start_date && s.actual_start_date >= today && s.actual_start_date <= weekStr;
                    return (
                      <Link key={s.id} href={`/projects/${s.project_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "var(--tint-active)" }}
                        >
                          <Hammer size={14} style={{ color: "var(--brand-blue)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.stage_name}</p>
                          <p className="text-xs text-gray-400">
                            {projectNames[s.project_id] ?? "Unknown"} · {isStart ? "Starts" : "Completes"}{" "}
                            {fmtDate((isStart ? s.actual_start_date : s.actual_end_date) ?? today)}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                  {todosDueThisWeek.slice(0, 3).map((t) => (
                    <Link key={t.id} href="/todos" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: t.priority === "urgent" ? "var(--tint-over)" : "var(--tint-warning)" }}
                      >
                        <ClipboardList
                          size={14}
                          style={{ color: t.priority === "urgent" ? "var(--status-over)" : "var(--status-warning)" }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.description}</p>
                        <p className="text-xs text-gray-400">
                          {projectNames[t.project_id ?? ""] ?? "General"} · Due {fmtDate(t.due_date!)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column — supporting context */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm">Counts</h2>
              </div>
              <div className="divide-y divide-gray-50 text-sm">
                <Link href="/invoices?status=pending_review" className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <span className="text-gray-700">Invoices to review</span>
                  <span className="font-semibold tabular-nums">{pendingInvoices.length}</span>
                </Link>
                <Link href="/invoices" className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <span className="text-gray-700">Past-due invoices</span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: pastDueInvoices.length > 0 ? "var(--status-over)" : undefined }}
                  >
                    {pastDueInvoices.length}
                  </span>
                </Link>
                <Link href="/todos" className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <span className="text-gray-700">Open to-dos</span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: openTodos > 0 ? "var(--status-over)" : undefined }}
                  >
                    {openTodos}
                  </span>
                </Link>
                <Link href="/vendors" className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <span className="text-gray-700">Vendor COI/license expiring</span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: expiringVendors.length > 0 ? "var(--status-warning)" : undefined }}
                  >
                    {expiringVendors.length}
                  </span>
                </Link>
                <Link href="/banking/draws" className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <span className="text-gray-700">Draws pending</span>
                  <span className="font-semibold tabular-nums">{pendingDraws}</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
