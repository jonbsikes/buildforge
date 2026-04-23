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
  budget_amount: number | null;
}

interface ActualRow {
  project_id: string;
  amount: number | null;
  status: string | null;
}

/**
 * Per-project health computed from stages + invoices + budget.
 */
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
  const total = stages.length;
  const complete = stages.filter((s) => s.status === "complete").length;
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

  const budgetDelta = actual - budget;
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

  // Weighted progress: weight by child's active count (proxy when we lack per-lot $)
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

function lotLabel(p: ProjectRow): string {
  if (p.block && p.lot) return `Block ${p.block}, Lot ${p.lot}`;
  if (p.lot) return `Lot ${p.lot}`;
  return p.address ?? p.name;
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
    supabase.from("project_cost_codes").select("project_id, budget_amount"),
    supabase.from("invoices").select("project_id, amount, status"),
  ]);

  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const stages = (stagesRes.data ?? []) as StageRow[];
  const phases = (phasesRes.data ?? []) as PhaseRow[];
  const budgets = (budgetsRes.data ?? []) as BudgetRow[];
  const actuals = (actualsRes.data ?? []) as ActualRow[];

  // Index lookups
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
      (budgetByProject.get(b.project_id) ?? 0) + (b.budget_amount ?? 0),
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

  // Group projects by subdivision (null = "Unassigned")
  const SUB_UNASSIGNED = "__no_subdivision__";
  const bySub = new Map<string, ProjectRow[]>();
  for (const p of projects) {
    const key = p.subdivision?.trim() || SUB_UNASSIGNED;
    const arr = bySub.get(key) ?? [];
    arr.push(p);
    bySub.set(key, arr);
  }

  const subdivisionNodes: TreeNode[] = [];
  const unassignedProjects: ProjectRow[] = [];

  for (const [subKey, subProjects] of bySub) {
    if (subKey === SUB_UNASSIGNED) {
      unassignedProjects.push(...subProjects);
      continue;
    }

    const landDevProjects = subProjects.filter((p) => p.project_type === "land_development");
    const homeProjects = subProjects.filter((p) => p.project_type === "home_construction");

    const branches: TreeNode[] = [];

    // ── Land Development branch ──
    if (landDevProjects.length > 0) {
      const ldProjectNodes: TreeNode[] = landDevProjects.map((p) => {
        const h = healthByProject.get(p.id)!;
        const projPhases = phasesByProject.get(p.id) ?? [];

        const phaseNodes: TreeNode[] = projPhases.map((ph) => {
          const phaseStatusDot: StatusKind =
            ph.status === "complete" ? "complete" : ph.status === "in_progress" ? "active" : "planned";
          const lotsTotal = ph.number_of_lots ?? 0;
          const lotsSold = ph.lots_sold ?? 0;

          return {
            id: `phase:${p.id}:${ph.phase_number}`,
            depth: 3,
            kind: "phase",
            name: ph.name ?? `Phase ${ph.phase_number ?? "?"}`,
            subtitle: `${lotsTotal} lots · ${lotsSold} sold · ${lotsTotal - lotsSold} remaining`,
            hasChildren: false,
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

        const landDevProjectRollup: TreeRollup = {
          activeCount: isActiveStatus(p.status) ? 1 : 0,
          atRiskCount: h.isOverBudget || h.hasDelayedStage ? 1 : 0,
          progressPct: h.progressPct,
          budgetDelta: h.budgetDelta,
          worstState: worstStateFromDot(h.statusDot),
        };

        const totalLots = projPhases.reduce((s, ph) => s + (ph.number_of_lots ?? 0), 0);
        const totalSold = projPhases.reduce((s, ph) => s + (ph.lots_sold ?? 0), 0);

        return {
          id: `landdev:${p.id}`,
          depth: 2 as const,
          kind: "land-dev-project" as const,
          name: p.name,
          subtitle: `${totalLots} lots · ${totalSold} sold`,
          href: `/projects/${p.id}`,
          children: phaseNodes,
          rollup: landDevProjectRollup,
          landDev: { lotsTotal: totalLots, lotsSold: totalSold, recognizedRevenue: 0 },
        };
      });

      const ldRollup = rollupChildren(ldProjectNodes);
      branches.push({
        id: `landdev-branch:${subKey}`,
        depth: 2,
        kind: "land-dev-branch",
        name: "Land Development",
        subtitle:
          ldProjectNodes.length === 1
            ? undefined
            : `${ldProjectNodes.length} projects`,
        children: ldProjectNodes,
        rollup: ldRollup,
      });
    }

    // ── Home Construction branch ──
    if (homeProjects.length > 0) {
      const lotNodes: TreeNode[] = homeProjects.map((p) => {
        const h = healthByProject.get(p.id)!;
        return {
          id: `home:${p.id}`,
          depth: 4 as const,
          kind: "lot-home" as const,
          name: lotLabel(p),
          subtitle: [p.plan, p.home_size_sf ? `${p.home_size_sf.toLocaleString()} SF` : null]
            .filter(Boolean)
            .join(" · "),
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
      });

      // Single synthetic phase node so hierarchy is 5-deep like the spec.
      // If phases.subdivision_id existed, we'd bucket lots by phase here.
      const phaseNode: TreeNode = {
        id: `home-phase:${subKey}`,
        depth: 3,
        kind: "phase",
        name: "Phase 1 lots",
        subtitle: `${lotNodes.length} lot${lotNodes.length !== 1 ? "s" : ""}`,
        children: lotNodes,
        rollup: rollupChildren(lotNodes),
      };

      branches.push({
        id: `home-branch:${subKey}`,
        depth: 2,
        kind: "home-construction-branch",
        name: "Home Construction",
        subtitle: `${lotNodes.length} home${lotNodes.length !== 1 ? "s" : ""} · ${lotNodes.filter((n) => n.rollup.activeCount > 0).length} active`,
        children: [phaseNode],
        rollup: rollupChildren([phaseNode]),
      });
    }

    const subRollup = rollupChildren(branches);

    // Dot-scan strip: one dot per lot/home across all branches
    const dotScan: { id: string; statusDot: StatusKind; label: string }[] = [];
    function collectDots(node: TreeNode) {
      if (node.kind === "lot-home" && node.lot) {
        dotScan.push({ id: node.id, statusDot: node.lot.statusDot, label: node.name });
      }
      for (const c of node.children) collectDots(c);
    }
    for (const b of branches) collectDots(b);

    subdivisionNodes.push({
      id: `sub:${subKey}`,
      depth: 1,
      kind: "subdivision",
      name: subKey,
      subtitle: `${subProjects.length} project${subProjects.length !== 1 ? "s" : ""}`,
      children: branches,
      rollup: subRollup,
      dotScan,
    });
  }

  // Unassigned projects → render as their own top-level nodes (kind of "orphan" home/land-dev)
  const orphanNodes: TreeNode[] = unassignedProjects.map((p) => {
    const h = healthByProject.get(p.id)!;
    const isHome = p.project_type === "home_construction";
    return {
      id: `orphan:${p.id}`,
      depth: 1,
      kind: isHome ? "lot-home" : "land-dev-project",
      name: p.name,
      subtitle: isHome
        ? [p.plan, p.home_size_sf ? `${p.home_size_sf.toLocaleString()} SF` : null, p.address]
            .filter(Boolean)
            .join(" · ")
        : p.address ?? undefined,
      href: `/projects/${p.id}`,
      children: [],
      rollup: {
        activeCount: isActiveStatus(p.status) ? 1 : 0,
        atRiskCount: h.isOverBudget || h.hasDelayedStage ? 1 : 0,
        progressPct: h.progressPct,
        budgetDelta: h.budgetDelta,
        worstState: worstStateFromDot(h.statusDot),
      },
      lot: isHome
        ? { statusDot: h.statusDot, currentStage: h.currentStage ?? undefined }
        : undefined,
    };
  });

  const root = [...subdivisionNodes, ...orphanNodes];
  const orgRollup = rollupChildren(root);

  return { root, orgRollup };
}
