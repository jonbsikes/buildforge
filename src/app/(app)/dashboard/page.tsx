import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ProjectCard from "@/components/dashboard/ProjectCard";
import AttentionCard from "@/components/dashboard/AttentionCard";
import type { StageStripStage } from "@/components/ui/StageStrip";
import Link from "next/link";
import {
  FolderOpen,
  AlertTriangle,
  ClipboardList,
  ChevronRight,
  Calendar,
  Hammer,
  ArrowRight,
  Plus,
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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0]!;
  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const weekStr = weekFromNow.toISOString().split("T")[0]!;

  const [
    { data: user },
    { data: projects },
    { data: pccRows },
    { data: invoices },
    { data: vendors },
    { data: fieldTodos },
    { data: buildStages },
    { data: draws },
  ] = await Promise.all([
    supabase.auth.getUser(),
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

  const firstName =
    (user?.user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user?.user?.email?.split("@")[0] ||
    "there";

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
  let urgentTodos = 0;
  for (const t of fieldTodos ?? []) {
    if (t.project_id) todosByProject[t.project_id] = (todosByProject[t.project_id] ?? 0) + 1;
    if (t.priority === "urgent") urgentTodos++;
  }

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
    const st = stagesByProject[pid] ?? [];
    return st.length === 0 ? 0 : Math.round((st.filter((s) => s.status === "complete").length / st.length) * 100);
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

  // Build stage strip data for each project
  function getStageStripData(pid: string) {
    const stages = stagesByProject[pid] ?? [];
    const extAll = stages.filter((s) => s.track === "exterior" || !s.track);
    const intAll = stages.filter((s) => s.track === "interior");

    function buildStrip(trackStages: typeof stages): StageStripStage[] {
      const result: StageStripStage[] = [];
      const lastComplete = [...trackStages].reverse().find((s) => s.status === "complete");
      const inProgress = trackStages.find((s) => s.status === "in_progress" || s.status === "delayed");
      const nextUp = trackStages.find((s) => s.status === "not_started");
      const secondNext = nextUp ? trackStages.find((s) => s.stage_number > nextUp.stage_number && s.status === "not_started") : null;

      if (lastComplete) result.push({ name: lastComplete.stage_name, status: "complete" });
      if (inProgress) result.push({ name: inProgress.stage_name, status: inProgress.status });
      if (nextUp) result.push({ name: nextUp.stage_name, status: "not_started", date: nextUp.actual_start_date ? fmtDate(nextUp.actual_start_date) : null });
      if (secondNext) result.push({ name: secondNext.stage_name, status: "not_started", date: secondNext.actual_start_date ? fmtDate(secondNext.actual_start_date) : null });
      return result;
    }

    return { ext: buildStrip(extAll), int: buildStrip(intAll), delayed: stages.filter((s) => s.status === "delayed").length };
  }

  const pendingInvoices = (invoices ?? []).filter((i) => i.status === "pending_review");
  const pastDueInvoices = (invoices ?? []).filter((i) => i.status !== "cleared" && i.status !== "void" && i.due_date && i.due_date < today);
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

  // ─── Build the Needs Attention list — sorted by priority ───
  type AttentionItem = {
    kind: "over" | "delayed" | "warning";
    priority: number; // higher = surface first
    title: string;
    subtitle: string;
    href: string;
  };
  const attention: AttentionItem[] = [];

  for (const p of overBudgetProjects) {
    const actual = actualByProject[p.id] ?? 0;
    const budget = budgetByProject[p.id] ?? 0;
    const over = actual - budget;
    attention.push({
      kind: "over",
      priority: 3,
      title: `${p.name} · over budget`,
      subtitle: `${fmt(over)} over · ${getCurrentStage(p.id)?.stage_name ?? "current stage"}`,
      href: `/projects/${p.id}`,
    });
  }

  for (const p of allProjects) {
    const d = getDelayedStageDays(p.id);
    if (d) {
      attention.push({
        kind: "delayed",
        priority: 2,
        title: `${p.name} · ${d.stage} delayed`,
        subtitle: `${d.days} day${d.days !== 1 ? "s" : ""} past schedule`,
        href: `/projects/${p.id}`,
      });
    }
  }

  for (const inv of pendingInvoices) {
    attention.push({
      kind: "warning",
      priority: 1,
      title: `Invoice ${inv.invoice_number ?? "#—"} · ${inv.vendor ?? "Unknown vendor"}`,
      subtitle: `Pending approval · ${fmt(inv.total_amount ?? inv.amount ?? 0)}`,
      href: `/invoices/${inv.id}`,
    });
  }

  for (const inv of pastDueInvoices) {
    attention.push({
      kind: "over",
      priority: 3,
      title: `Invoice ${inv.invoice_number ?? "#—"} · past due`,
      subtitle: `${inv.vendor ?? "Unknown vendor"} · ${fmt(inv.total_amount ?? inv.amount ?? 0)}`,
      href: `/invoices/${inv.id}`,
    });
  }

  for (const v of expiringVendors) {
    const c = daysUntil(v.coi_expiry_date);
    const l = daysUntil(v.license_expiry_date);
    const which: string =
      c !== null && c <= 30 && (l === null || c < l) ? "COI" : "License";
    const days = which === "COI" ? c ?? 0 : l ?? 0;
    attention.push({
      kind: "warning",
      priority: 1,
      title: `${v.name} · ${which} ${days < 0 ? "expired" : "expiring"}`,
      subtitle: days < 0 ? `Expired ${-days}d ago` : `Expires in ${days}d`,
      href: `/vendors/${v.id}`,
    });
  }

  attention.sort((a, b) => b.priority - a.priority);
  const visibleAttention = attention.slice(0, 8);

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
    const strip = getStageStripData(p.id);
    return { project: p, currentStage: getCurrentStage(p.id), nextStage: getNextStage(p.id), progress: getStageProgress(p.id), budget: budgetByProject[p.id] ?? 0, spent: actualByProject[p.id] ?? 0, todoCount: todosByProject[p.id] ?? 0, extStages: strip.ext, intStages: strip.int, delayedCount: strip.delayed };
  }

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">

        {/* ── Greeting + at-risk counter ── */}
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-2xl font-semibold text-gray-900">
            {greeting()}, {firstName}
          </h2>
          <div className="flex items-center gap-2">
            <Link
              href="/projects/new"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 border border-[color:var(--card-border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus size={13} /> New Project
            </Link>
            {attention.length > 0 && (
              <a
                href="#needs-attention"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  backgroundColor: "rgb(239 68 68 / 0.1)",
                  color: "var(--status-over)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--status-over)" }}
                />
                {attention.length} need attention
              </a>
            )}
          </div>
        </div>

        {/* ── Slim metrics row ── */}
        <div className="text-sm text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1 mb-6 tabular-nums">
          <span><span className="font-semibold text-gray-900">{activeCount}</span> active</span>
          <span className="text-gray-300">·</span>
          <span><span className="font-semibold text-gray-900">{fmt(inFlightTotal)}</span> in flight</span>
          <span className="text-gray-300">·</span>
          <span><span className="font-semibold text-gray-900">{fmt(apThisWeek)}</span> AP this week</span>
          <span className="text-gray-300">·</span>
          <span><span className="font-semibold text-gray-900">{fmt(outstandingAP)}</span> AP outstanding</span>
          {pendingDraws > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span><span className="font-semibold text-gray-900">{pendingDraws}</span> draw{pendingDraws !== 1 ? "s" : ""} pending</span>
            </>
          )}
        </div>

        {/* ── Needs Attention (hero) ── */}
        {attention.length > 0 && (
          <section id="needs-attention" className="mb-8 scroll-mt-4">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Needs Attention
              </h3>
              {attention.length > 8 && (
                <Link
                  href="/projects"
                  className="text-xs font-medium"
                  style={{ color: "var(--brand-blue)" }}
                >
                  Show all {attention.length} →
                </Link>
              )}
            </div>
            <div className="bg-[color:var(--card-bg)] rounded-[var(--card-radius)] border border-[color:var(--card-border)] overflow-hidden">
              {visibleAttention.map((a, i) => (
                <AttentionCard
                  key={`${a.href}:${i}`}
                  kind={a.kind}
                  title={a.title}
                  subtitle={a.subtitle}
                  href={a.href}
                />
              ))}
            </div>
          </section>
        )}

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
                  <span className="text-gray-700">Urgent to-dos</span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: urgentTodos > 0 ? "var(--status-over)" : undefined }}
                  >
                    {urgentTodos}
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
