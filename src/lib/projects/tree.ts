import { createClient } from "@/lib/supabase/server";
import type { StatusKind } from "@/components/ui/StatusBadge";

export type WorstState = "ok" | "delayed" | "over-budget" | "complete";

export interface TreeRollup {
  activeCount: number;
  atRiskCount: number;
  progressPct: number;
  budgetDelta: number;
  worstState: WorstState;
}

export type TreeNodeKind =
  | "org"
  | "subdivision"
  | "land-dev-branch"
  | "home-construction-branch"
  | "land-dev-project"
  | "phase"
  | "lot-home"
  | "lot-forsale";

export interface TreeNode {
  id: string;
  depth: 0 | 1 | 2 | 3 | 4;
  kind: TreeNodeKind;
  name: string;
  subtitle?: string;
  href?: string;
  children: TreeNode[];
  rollup: TreeRollup;
  landDev?: {
    lotsTotal: number;
    lotsSold: number;
    recognizedRevenue: number;
  };
  lot?: {
    statusDot: StatusKind;
    currentStage?: string;
    buildingFor?: string;
  };
  /** Raw leaf-level data bag for subdivision dot-scan strip. */
  dotScan?: { id: string; statusDot: StatusKind; label: string }[];
}

interface ProjectRow {
  id: string;
  name: string;
  address: string | null;
  status: string;
  project_type: string;
  subdivision: string | null;
  block: string | null;
  lot: string | null;
  plan: string | null;
  home_size_sf: number | null;
  size_acres: number | null;
  number_of_lots: number | null;
  start_date: string | null;
}

interface StageRow {
  project_id: string;
  stage_name: string | null;
  stage_number: number | null;
  status: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
}

interface PhaseRow {
  project_id: string;
  phase_number: number | null;
  name: string | null;
  status: string;
  number_of_lots: number | null;
  lots_sold: number;
}

interface BudgetRow {
  project_id: string;
  budgeted_amount: number | null;
}

interface ActualRow {
  project_id: string;
  amount: number | null;
  status: string | null;
}

interface ProjectHealth {
  progressPct: number;
  budget: number;
  actual: number;
  budgetDelta: number;
  isOverBudget: boolean;
  hasDelayedStage: boolean;
  currentStage: string | null;
  statusDot: StatusKind;
}

function computeProjectHealth(
  project: ProjectRow,
  stages: StageRow[],
  budget: number,
  actual: number,
): ProjectHealth {
  const today = new Date().toISOString().split("T")[0]!;
  // Skipped stages count as done — they're stages that don't apply to this
  // project, not stages still owed. Excluding them from the denominator keeps
  // two projects at the same point in the build cycle showing the same %.
  const activeStages = stages.filter((s) => s.status !== "skipped");
  const total = activeStages.length;
  const complete = activeStages.filter(
    (s) => s.status === "complete" || s.status === "completed",
  ).length;
  const progressPct = total > 0 ? Math.round((complete / total) * 100) : 0;

  const inProgressStage = stages.find((s) => s.status === "in_progress");
  const currentStage =
    inProgressStage?.stage_name ??
    stages.find((s) => s.status === "not_started")?.stage_name ??
    null;

  const hasDelayedStage = stages.some(
    (s) =>
      s.status !== "complete" &&
      s.status !== "completed" &&
      s.status !== "skipped" &&
      s.planned_end_date !== null &&
      s.planned_end_date < today,
  );

  // When no budget is set, skip "over budget" signaling — we don't have
  // anything meaningful to compare actuals against. Delta stays at 0 so
  // the tree doesn't show a misleading "+$XXXk over" against a zero budget.
  const budgetDelta = budget > 0 ? actual - budget : 0;
  const isOverBudget = budget > 0 && actual > budget;

  let statusDot: StatusKind = "planned";
  if (project.status === "completed") statusDot = "complete";
  else if (isOverBudget) statusDot = "over";
  else if (hasDelayedStage) statusDot = "delayed";
  else if (project.status === "active") statusDot = "active";
  else if (project.status === "on_hold") statusDot = "warning";
  else if (project.status === "cancelled") statusDot = "over";

  return {
    progressPct,
    budget,
    actual,
    budgetDelta,
    isOverBudget,
    hasDelayedStage,
    currentStage,
    statusDot,
  };
}

function rollupChildren(children: TreeNode[]): TreeRollup {
  if (children.length === 0) {
    return {
      activeCount: 0,
      atRiskCount: 0,
      progressPct: 0,
      budgetDelta: 0,
      worstState: "ok",
    };
  }

  const activeCount = children.reduce((s, c) => s + c.rollup.activeCount, 0);
  const atRiskCount = children.reduce((s, c) => s + c.rollup.atRiskCount, 0);
  const budgetDelta = children.reduce((s, c) => s + c.rollup.budgetDelta, 0);

  const totalWeight = children.reduce((s, c) => s + Math.max(c.rollup.activeCount, 1), 0);
  const progressPct = Math.round(
    children.reduce(
      (s, c) => s + c.rollup.progressPct * Math.max(c.rollup.activeCount, 1),
      0,
    ) / totalWeight,
  );

  let worstState: WorstState = "ok";
  if (children.some((c) => c.rollup.worstState === "over-budget")) worstState = "over-budget";
  else if (children.some((c) => c.rollup.worstState === "delayed")) worstState = "delayed";
  else if (children.every((c) => c.rollup.worstState === "complete")) worstState = "complete";

  return { activeCount, atRiskCount, progressPct, budgetDelta, worstState };
}

function worstStateFromDot(dot: StatusKind): WorstState {
  if (dot === "over") return "over-budget";
  if (dot === "delayed") return "delayed";
  if (dot === "complete") return "complete";
  return "ok";
}

function isActiveStatus(s: string): boolean {
  return s === "active" || s === "pre_construction";
}

function lotLabel(p: ProjectRow): string | null {
  if (p.block && p.lot) return `Block ${p.block}, Lot ${p.lot}`;
  if (p.lot) return `Lot ${p.lot}`;
  return null;
}

export async function getProjectsTree(): Promise<{
  root: TreeNode[];
  orgRollup: TreeRollup;
}> {
  const supabase = await createClient();

  const [projectsRes, stagesRes, phasesRes, budgetsRes, actualsRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, address, status, project_type, subdivision, block, lot, plan, home_size_sf, size_acres, number_of_lots, start_date",
      )
      .order("start_date", { ascending: true }),
    supabase
      .from("build_stages")
      .select("project_id, stage_name, stage_number, status, planned_end_date, actual_end_date")
      .order("stage_number", { ascending: true }),
    supabase
      .from("project_phases")
      .select("project_id, phase_number, name, status, number_of_lots, lots_sold")
      .order("phase_number", { ascending: true }),
    supabase.from("project_cost_codes").select("project_id, budgeted_amount"),
    supabase.from("invoices").select("project_id, amount, status"),
  ]);

  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const stages = (stagesRes.data ?? []) as StageRow[];
  const phases = (phasesRes.data ?? []) as PhaseRow[];
  const budgets = (budgetsRes.data ?? []) as BudgetRow[];
  const actuals = (actualsRes.data ?? []) as ActualRow[];

  const stagesByProject = new Map<string, StageRow[]>();
  for (const s of stages) {
    const arr = stagesByProject.get(s.project_id) ?? [];
    arr.push(s);
    stagesByProject.set(s.project_id, arr);
  }

  const phasesByProject = new Map<string, PhaseRow[]>();
  for (const p of phases) {
    const arr = phasesByProject.get(p.project_id) ?? [];
    arr.push(p);
    phasesByProject.set(p.project_id, arr);
  }

  const budgetByProject = new Map<string, number>();
  for (const b of budgets) {
    if (!b.project_id) continue;
    budgetByProject.set(
      b.project_id,
      (budgetByProject.get(b.project_id) ?? 0) + (b.budgeted_amount ?? 0),
    );
  }

  const actualByProject = new Map<string, number>();
  const APPROVED_STATUSES = new Set(["approved", "released", "cleared"]);
  for (const a of actuals) {
    if (!a.project_id) continue;
    if (!a.status || !APPROVED_STATUSES.has(a.status)) continue;
    actualByProject.set(
      a.project_id,
      (actualByProject.get(a.project_id) ?? 0) + (a.amount ?? 0),
    );
  }

  const healthByProject = new Map<string, ProjectHealth>();
  for (const p of projects) {
    const s = stagesByProject.get(p.id) ?? [];
    const b = budgetByProject.get(p.id) ?? 0;
    const a = actualByProject.get(p.id) ?? 0;
    healthByProject.set(p.id, computeProjectHealth(p, s, b, a));
  }

  function buildLotNode(p: ProjectRow): TreeNode {
    const h = healthByProject.get(p.id)!;
    return {
      id: `home:${p.id}`,
      depth: 2,
      kind: "lot-home",
      name: p.name,
      subtitle: [
        lotLabel(p),
        p.plan,
        p.home_size_sf ? `${p.home_size_sf.toLocaleString()} SF` : null,
        p.address && p.address !== p.name ? p.address : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
      href: `/projects/${p.id}`,
      children: [],
      rollup: {
        activeCount: isActiveStatus(p.status) ? 1 : 0,
        atRiskCount: h.isOverBudget || h.hasDelayedStage ? 1 : 0,
        progressPct: h.progressPct,
        budgetDelta: h.budgetDelta,
        worstState: worstStateFromDot(h.statusDot),
      },
      lot: {
        statusDot: h.statusDot,
        currentStage: h.currentStage ?? undefined,
      },
    };
  }

  function buildLandDevProjectNode(p: ProjectRow): TreeNode {
    const h = healthByProject.get(p.id)!;
    const projPhases = phasesByProject.get(p.id) ?? [];

    const phaseNodes: TreeNode[] = projPhases.map((ph) => {
      const phaseStatusDot: StatusKind =
        ph.status === "complete" ? "complete" : ph.status === "in_progress" ? "active" : "planned";
      const lotsTotal = ph.number_of_lots ?? 0;
      const lotsSold = ph.lots_sold ?? 0;
      return {
        id: `phase:${p.id}:${ph.phase_number}`,
        depth: 2,
        kind: "phase",
        name: ph.name ?? `Phase ${ph.phase_number ?? "?"}`,
        subtitle: `${lotsTotal} lots · ${lotsSold} sold · ${lotsTotal - lotsSold} remaining`,
        children: [],
        rollup: {
          activeCount: ph.status === "in_progress" ? 1 : 0,
          atRiskCount: 0,
          progressPct: ph.status === "complete" ? 100 : ph.status === "in_progress" ? 50 : 0,
          budgetDelta: 0,
          worstState: worstStateFromDot(phaseStatusDot),
        },
        landDev: { lotsTotal, lotsSold, recognizedRevenue: 0 },
      };
    });

    const totalLots = projPhases.reduce((s, ph) => s + (ph.number_of_lots ?? 0), 0);
    const totalSold = projPhases.reduce((s, ph) => s + (ph.lots_sold ?? 0), 0);
    const subtitleBits: string[] = [];
    if (p.subdivision) subtitleBits.push(p.subdivision);
    if (totalLots > 0) subtitleBits.push(`${totalLots} lots · ${totalSold} sold`);

    return {
      id: `landdev:${p.id}`,
      depth: 1,
      kind: "land-dev-project",
      name: p.name,
      subtitle: subtitleBits.join(" · ") || p.address || undefined,
      href: `/projects/${p.id}`,
      children: phaseNodes,
      rollup: {
        activeCount: isActiveStatus(p.status) ? 1 : 0,
        atRiskCount: h.isOverBudget || h.hasDelayedStage ? 1 : 0,
        progressPct: h.progressPct,
        budgetDelta: h.budgetDelta,
        worstState: worstStateFromDot(h.statusDot),
      },
      landDev: { lotsTotal: totalLots, lotsSold: totalSold, recognizedRevenue: 0 },
    };
  }

  // ─── Home Construction section ───
  const homeProjects = projects.filter((p) => p.project_type === "home_construction");
  const homeSection: TreeNode | null = (() => {
    if (homeProjects.length === 0) return null;

    const bySub = new Map<string, ProjectRow[]>();
    const orphans: ProjectRow[] = [];
    for (const p of homeProjects) {
      const sub = p.subdivision?.trim();
      if (!sub) {
        orphans.push(p);
        continue;
      }
      const arr = bySub.get(sub) ?? [];
      arr.push(p);
      bySub.set(sub, arr);
    }

    const subNodes: TreeNode[] = [];
    for (const [subName, subProjects] of bySub) {
      const lotNodes = subProjects.map(buildLotNode);
      const dotScan: { id: string; statusDot: StatusKind; label: string }[] = lotNodes
        .filter((n) => n.lot)
        .map((n) => ({ id: n.id, statusDot: n.lot!.statusDot, label: n.name }));

      subNodes.push({
        id: `sub:home:${subName}`,
        depth: 1,
        kind: "subdivision",
        name: subName,
        subtitle: `${lotNodes.length} home${lotNodes.length !== 1 ? "s" : ""} · ${lotNodes.filter((n) => n.rollup.activeCount > 0).length} active`,
        children: lotNodes,
        rollup: rollupChildren(lotNodes),
        dotScan,
      });
    }

    // Promote orphan homes to depth 1 directly under Home Construction
    const orphanLots = orphans.map((p) => {
      const base = buildLotNode(p);
      return { ...base, depth: 1 as const };
    });

    const allChildren = [...subNodes, ...orphanLots];
    return {
      id: "section:home",
      depth: 0,
      kind: "home-construction-branch",
      name: "Home Construction",
      subtitle: `${homeProjects.length} home${homeProjects.length !== 1 ? "s" : ""}`,
      children: allChildren,
      rollup: rollupChildren(allChildren),
    };
  })();

  // ─── Land Development section ───
  const landDevProjects = projects.filter((p) => p.project_type === "land_development");
  const landSection: TreeNode | null = (() => {
    if (landDevProjects.length === 0) return null;
    const projectNodes = landDevProjects.map(buildLandDevProjectNode);
    return {
      id: "section:land",
      depth: 0,
      kind: "land-dev-branch",
      name: "Land Development",
      subtitle: `${landDevProjects.length} project${landDevProjects.length !== 1 ? "s" : ""}`,
      children: projectNodes,
      rollup: rollupChildren(projectNodes),
    };
  })();

  const root = [homeSection, landSection].filter((n): n is TreeNode => n !== null);
  const orgRollup = rollupChildren(root);

  return { root, orgRollup };
}
