import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ProjectCard from "@/components/dashboard/ProjectCard";
import AttentionQueue, { type AttentionItem } from "@/components/dashboard/AttentionQueue";
import type { StageStripStage } from "@/components/ui/StageStrip";
import Link from "next/link";
import {
  FolderOpen,
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

  // Projects first — the stage/budget queries are scoped to these ids.
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, project_type, subdivision, address, start_date, block, lot, plan, home_size_sf, size_acres, number_of_lots")
    .in("status", ["active", "pre_construction"])
    .order("created_at", { ascending: false });

  const allProjects = projects ?? [];
  const projectIds = allProjects.map((p) => p.id);

  const [
    budgetTotalsRes,
    actualTotalsRes,
    { data: invoices },
    { data: vendors },
    { data: fieldTodos },
    { data: buildStages },
    { data: draws },
  ] = await Promise.all([
    // Per-project budget + invoice-actual totals aggregated in SQL — the raw
    // rows grow forever and would silently cap at 1,000.
    (supabase.rpc as any)("get_project_budget_totals"),
    (supabase.rpc as any)("get_project_invoice_actuals"),
    // Open-AP invoices only — these statuses are all the KPIs below need.
    // vendor/vendor_id/ai_confidence/manually_reviewed/created_at feed the
    // item-level attention queue (Package 02).
    supabase.from("invoices").select("id, status, amount, total_amount, due_date, invoice_number, vendor, vendor_id, ai_confidence, manually_reviewed, created_at").in("status", ["pending_review", "approved", "released", "disputed"]).order("created_at", { ascending: false }).limit(2000),
    supabase.from("vendors").select("id, name, coi_expiry_date, license_expiry_date"),
    supabase.from("field_todos").select("id, status, priority, description, project_id, due_date").neq("status", "done"),
    supabase.from("build_stages").select("id, project_id, stage_name, stage_number, status, track, planned_start_date, planned_end_date, actual_start_date, actual_end_date").in("project_id", projectIds).order("stage_number", { ascending: true }),
    supabase.from("loan_draws").select("id, status").in("status", ["draft", "submitted"]),
  ]);

  const activeCount = allProjects.filter((p) => p.status === "active").length;

  const budgetByProject: Record<string, number> = {};
  for (const r of (budgetTotalsRes.data ?? []) as { project_id: string; total_budget: number }[]) {
    budgetByProject[r.project_id] = Number(r.total_budget);
  }

  const actualByProject: Record<string, number> = {};
  for (const r of (actualTotalsRes.data ?? []) as { project_id: string; actual_amount: number }[]) {
    actualByProject[r.project_id] = Number(r.actual_amount);
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
  const pastDueInvoices = (invoices ?? []).filter((i) => i.status !== "released" && i.status !== "cleared" && i.status !== "void" && i.due_date && i.due_date < today);
  const outstandingAP = (invoices ?? []).filter((i) => i.status === "approved").reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);

  // AP due this week
  const apThisWeek = (invoices ?? [])
    .filter((i) => i.status !== "cleared" && i.status !== "void")
    .filter((i) => i.due_date && i.due_date >= today && i.due_date <= weekStr)
    .reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);

  // Project "in-flight" total = sum of active project budgets
  const inFlightTotal = allProjects.reduce((s, p) => s + (budgetByProject[p.id] ?? 0), 0);

  const pendingDraws = (draws ?? []).length;

  const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
  const expiringVendors = (vendors ?? []).filter((v) => { const c = daysUntil(v.coi_expiry_date); const l = daysUntil(v.license_expiry_date); return (c !== null && c <= 30) || (l !== null && l <= 30); });
  const overBudgetProjects = allProjects.filter((p) => { const a = actualByProject[p.id] ?? 0; const b = budgetByProject[p.id] ?? 0; return a > b && b > 0; });
  const overBudgetDetail = overBudgetProjects.map((p) => {
    const a = actualByProject[p.id] ?? 0;
    const b = budgetByProject[p.id] ?? 0;
    return { id: p.id, name: p.name, delta: a - b, pct: b > 0 ? Math.round((a / b) * 100) : 0 };
  });

  // ─── Item-level attention queue (Package 02) ───
  // Flat scored list from data already fetched: past-due invoices (sev 3, by
  // $ desc), over-budget projects (3, by delta), pending-review invoices (2,
  // by age), delayed stages (2, by days late), expiring COI/license (1, by
  // days-to-expiry). Top 5 render as AttentionCards; the rest roll up into
  // the footer line.
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  type QueueEntry = AttentionItem & { severity: number; urgency: number; category: string };
  const queue: QueueEntry[] = [];

  const pastDueIds = new Set(pastDueInvoices.map((i) => i.id));
  for (const inv of pastDueInvoices) {
    const amt = inv.total_amount ?? inv.amount ?? 0;
    const daysLate = inv.due_date
      ? Math.floor((Date.now() - new Date(inv.due_date + "T00:00:00").getTime()) / 86400000)
      : 0;
    queue.push({
      key: `pastdue-${inv.id}`,
      kind: "over",
      severity: 3,
      urgency: amt,
      category: "past due",
      title: `Invoice ${inv.invoice_number ? `#${inv.invoice_number}` : ""} · ${inv.vendor ?? "Unknown vendor"} · ${fmtMoney(amt)}`,
      subtitle: `${daysLate} day${daysLate !== 1 ? "s" : ""} past due`,
      href: `/invoices/${inv.id}`,
      // Only approved invoices can have a check cut; past-due rows still in
      // review get the Approve action (downgraded by the guard if incomplete).
      action:
        inv.status === "approved"
          ? "issue_check"
          : inv.status === "pending_review"
            ? "approve"
            : undefined,
      invoiceId: inv.id,
    });
  }

  for (const p of overBudgetDetail) {
    queue.push({
      key: `overbudget-${p.id}`,
      kind: "over",
      severity: 3,
      urgency: p.delta,
      category: "over budget",
      title: `${p.name} — over budget ${fmtMoney(p.delta)}`,
      subtitle: `${p.pct}% of budget spent`,
      href: `/projects/${p.id}`,
    });
  }

  for (const inv of pendingInvoices) {
    if (pastDueIds.has(inv.id)) continue; // already queued at severity 3
    const amt = inv.total_amount ?? inv.amount ?? 0;
    const ageDays = inv.created_at
      ? Math.floor((Date.now() - new Date(inv.created_at).getTime()) / 86400000)
      : 0;
    queue.push({
      key: `review-${inv.id}`,
      kind: "warning",
      severity: 2,
      urgency: ageDays,
      category: "to review",
      title: `Invoice ${inv.invoice_number ? `#${inv.invoice_number}` : ""} · ${inv.vendor ?? "Unknown vendor"} · ${fmtMoney(amt)}`,
      subtitle: `Pending review${ageDays > 0 ? ` · ${ageDays} day${ageDays !== 1 ? "s" : ""} old` : ""}`,
      href: `/invoices/${inv.id}`,
      action: "approve", // may be downgraded to "review" by the guard below
      invoiceId: inv.id,
    });
  }

  for (const p of allProjects) {
    const delayed = getDelayedStageDays(p.id);
    if (!delayed) continue;
    queue.push({
      key: `delayed-${p.id}`,
      kind: "delayed",
      severity: 2,
      urgency: delayed.days,
      category: "delayed",
      title: `${p.name} · ${delayed.stage}`,
      subtitle: `${delayed.days} day${delayed.days !== 1 ? "s" : ""} behind plan`,
      href: `/projects/${p.id}`,
    });
  }

  for (const v of expiringVendors) {
    const c = daysUntil(v.coi_expiry_date);
    const l = daysUntil(v.license_expiry_date);
    const soonest = Math.min(c ?? 999, l ?? 999);
    const which = (c ?? 999) <= (l ?? 999) ? "COI" : "License";
    queue.push({
      key: `vendor-${v.id}`,
      kind: "warning",
      severity: 1,
      urgency: -soonest, // closer expiry = more urgent
      category: "expiring",
      title: soonest <= 0
        ? `${v.name} — ${which} expired`
        : `${v.name} — ${which} expires in ${soonest} day${soonest !== 1 ? "s" : ""}`,
      subtitle: soonest <= 0 ? "Vendor is blocked until renewed" : "Renewal needed",
      href: `/vendors/${v.id}`,
      action: "open_vendor",
    });
  }

  queue.sort((a, b) => b.severity - a.severity || b.urgency - a.urgency);
  const topItems = queue.slice(0, 5);
  const attentionTotal = queue.length;

  // Needs-attention guard for the inline Approve: same rule as the AP page —
  // missing vendor, non-positive amount, low AI confidence (unless manually
  // reviewed), or any line item missing a cost code → Review link instead.
  const guardIds = topItems
    .filter((t) => t.action === "approve" && t.invoiceId)
    .map((t) => t.invoiceId!) as string[];
  if (guardIds.length > 0) {
    const invById = new Map((invoices ?? []).map((i) => [i.id, i]));
    const { data: lineRows } = await supabase
      .from("invoice_line_items")
      .select("invoice_id, cost_code")
      .in("invoice_id", guardIds);
    const missingCode = new Set<string>();
    for (const li of (lineRows ?? []) as { invoice_id: string; cost_code: string | null }[]) {
      if (!li.cost_code) missingCode.add(li.invoice_id);
    }
    for (const item of topItems) {
      if (item.action !== "approve" || !item.invoiceId) continue;
      const inv = invById.get(item.invoiceId);
      if (!inv) continue;
      const flagged =
        !inv.vendor_id ||
        inv.amount == null ||
        inv.amount <= 0 ||
        inv.ai_confidence === "low" ||
        missingCode.has(inv.id);
      if (flagged && !inv.manually_reviewed) item.action = "review";
    }
  }

  // Category rollup for items beyond the top 5.
  const shownKeys = new Set(topItems.map((t) => t.key));
  const remainder: Record<string, number> = {};
  for (const q of queue) {
    if (shownKeys.has(q.key)) continue;
    remainder[q.category] = (remainder[q.category] ?? 0) + 1;
  }
  const rollup = Object.entries(remainder).map(
    ([cat, n]) => `+ ${n} more ${cat}`,
  );

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

        {/* ── Needs Attention work queue (hidden entirely at zero items) ── */}
        {attentionTotal > 0 && (
          <AttentionQueue
            items={topItems.map(({ severity, urgency, category, ...item }) => item)}
            totalCount={attentionTotal}
            rollup={rollup}
          />
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
            <Link href="/todos">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Open to-dos</p>
              <p className="text-lg font-bold text-gray-900 leading-none mt-1">{openTodos}</p>
            </Link>
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
          <div className={`${hasWeeklyActivity ? "lg:col-span-2" : "lg:col-span-3"} space-y-6`}>

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
          </div>

          {/* Right Column — This Week only (Counts card removed; its numbers
              live in the hero items and the metrics strip, Package 02 §4) */}
          {hasWeeklyActivity && (
            <div className="space-y-4">
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
            </div>
          )}
        </div>
      </main>
    </>
  );
}
