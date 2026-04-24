"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Layers, Target, AlertTriangle, X } from "lucide-react";
import TreeRow from "./TreeRow";
import type { TreeNode, TreeRollup } from "@/lib/projects/tree";

const STORAGE_KEY = "projects.open";

type ViewMode = "default" | "rollup" | "focus" | "flat";

interface ProjectsTreeProps {
  root: TreeNode[];
  orgRollup: TreeRollup;
  /**
   * When set, the tree starts in Focus mode scoped to this target node.
   * Used by the URL-scoped routes (/projects/tree/home/..., /projects/tree/land/...).
   */
  initialFocusTargetId?: string;
}

function matchesSearch(node: TreeNode, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const selfMatch =
    node.name.toLowerCase().includes(lower) ||
    (node.subtitle?.toLowerCase().includes(lower) ?? false);
  return selfMatch || node.children.some((c) => matchesSearch(c, lower));
}

function buildVisible(
  nodes: TreeNode[],
  openIds: Set<string>,
  search: string,
): { list: TreeNode[]; parentOf: Map<string, string> } {
  const list: TreeNode[] = [];
  const parentOf = new Map<string, string>();

  function walk(arr: TreeNode[], parentId: string | null) {
    for (const n of arr) {
      if (!matchesSearch(n, search)) continue;
      list.push(n);
      if (parentId) parentOf.set(n.id, parentId);
      if (n.children.length > 0 && (openIds.has(n.id) || search !== "")) {
        walk(n.children, n.id);
      }
    }
  }
  walk(nodes, null);
  return { list, parentOf };
}

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNodeById(n.children, id);
    if (hit) return hit;
  }
  return null;
}

interface FocusTarget {
  id: string;
  label: string;
}

function collectFocusTargets(nodes: TreeNode[]): FocusTarget[] {
  const out: FocusTarget[] = [];
  function walk(arr: TreeNode[], sectionName: string | null) {
    for (const n of arr) {
      if (n.kind === "home-construction-branch" || n.kind === "land-dev-branch") {
        walk(n.children, n.name);
      } else if (n.kind === "subdivision" || n.kind === "land-dev-project") {
        out.push({ id: n.id, label: sectionName ? `${sectionName} · ${n.name}` : n.name });
      }
    }
  }
  walk(nodes, null);
  return out;
}

interface AtRiskItem {
  node: TreeNode;
  breadcrumb: string;
}

function collectAtRiskLeaves(nodes: TreeNode[]): AtRiskItem[] {
  const out: AtRiskItem[] = [];
  function walk(arr: TreeNode[], pathNames: string[]) {
    for (const n of arr) {
      const isLeaf = n.children.length === 0;
      if (isLeaf) {
        if (n.rollup.atRiskCount > 0 || n.rollup.worstState === "delayed" || n.rollup.worstState === "over-budget") {
          out.push({ node: n, breadcrumb: pathNames.join(" / ") });
        }
      } else {
        walk(n.children, [...pathNames, n.name]);
      }
    }
  }
  walk(nodes, []);
  return out;
}

export default function ProjectsTree({ root, orgRollup, initialFocusTargetId }: ProjectsTreeProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialFocusTargetId ? "focus" : "default");
  const [focusTargetId, setFocusTargetId] = useState<string | null>(initialFocusTargetId ?? null);
  const router = useRouter();
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const next = new Set<string>();
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) for (const id of arr) next.add(id);
      } else {
        for (const n of root) next.add(n.id);
      }
      // Auto-expand the focus target on a URL-scoped load so its children
      // are visible without requiring an extra click.
      if (initialFocusTargetId) next.add(initialFocusTargetId);
      setOpenIds(next);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...openIds]));
    } catch {}
  }, [openIds]);

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => {
    const all = new Set<string>();
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.children.length > 0) {
          all.add(n.id);
          walk(n.children);
        }
      }
    }
    walk(root);
    setOpenIds(all);
  };

  const collapseAll = () => setOpenIds(new Set());

  // Focus targets (subdivisions + land-dev-projects).
  const focusTargets = useMemo(() => collectFocusTargets(root), [root]);

  // Decide the effective tree root based on view mode.
  const effectiveRoot: TreeNode[] = useMemo(() => {
    if (viewMode === "focus" && focusTargetId) {
      const hit = findNodeById(root, focusTargetId);
      return hit ? [hit] : root;
    }
    return root;
  }, [root, viewMode, focusTargetId]);

  // In Rollup mode, force only the top-level section headers open — everything else collapsed.
  const effectiveOpenIds: Set<string> = useMemo(() => {
    if (viewMode === "rollup") {
      return new Set(effectiveRoot.map((n) => n.id));
    }
    return openIds;
  }, [viewMode, effectiveRoot, openIds]);

  const { list: visible, parentOf } = useMemo(
    () => buildVisible(effectiveRoot, effectiveOpenIds, search),
    [effectiveRoot, effectiveOpenIds, search],
  );

  const atRiskItems = useMemo(
    () => (viewMode === "flat" ? collectAtRiskLeaves(root) : []),
    [root, viewMode],
  );

  void orgRollup;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (viewMode === "flat") return;
    if (visible.length === 0) return;
    const cur = focusIndex ?? 0;
    const node = visible[cur];

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusIndex(Math.min(cur + 1, visible.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusIndex(Math.max(cur - 1, 0));
        break;
      case "ArrowRight":
        e.preventDefault();
        if (node && node.children.length > 0 && !effectiveOpenIds.has(node.id)) {
          if (viewMode === "rollup") return;
          toggle(node.id);
        } else if (node && node.children.length > 0) {
          setFocusIndex(Math.min(cur + 1, visible.length - 1));
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (node && node.children.length > 0 && effectiveOpenIds.has(node.id)) {
          if (viewMode === "rollup") return;
          toggle(node.id);
        } else if (node) {
          const parentId = parentOf.get(node.id);
          if (parentId) {
            const idx = visible.findIndex((n) => n.id === parentId);
            if (idx >= 0) setFocusIndex(idx);
          }
        }
        break;
      case "Enter":
        if (node?.href) {
          e.preventDefault();
          router.push(node.href);
        } else if (node && node.children.length > 0) {
          e.preventDefault();
          if (viewMode !== "rollup") toggle(node.id);
        }
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (focusIndex === null) return;
    const el = treeRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${focusIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIndex]);

  function selectMode(next: ViewMode) {
    setViewMode(next);
    if (next === "focus" && !focusTargetId && focusTargets.length > 0) {
      setFocusTargetId(focusTargets[0]!.id);
    }
  }

  const focusTargetLabel = focusTargets.find((t) => t.id === focusTargetId)?.label ?? null;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, addresses, plans…"
            className="w-full pl-9 pr-3 py-1.5 border border-[color:var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
          />
        </div>

        {/* View mode segmented buttons */}
        <div className="inline-flex items-center rounded-lg border border-[color:var(--card-border)] overflow-hidden text-xs">
          <ViewModeButton
            active={viewMode === "default"}
            onClick={() => selectMode("default")}
            label="Default"
          />
          <ViewModeButton
            active={viewMode === "rollup"}
            onClick={() => selectMode("rollup")}
            icon={<Layers size={12} />}
            label="Rollup"
          />
          <ViewModeButton
            active={viewMode === "focus"}
            onClick={() => selectMode("focus")}
            icon={<Target size={12} />}
            label="Focus"
          />
          <ViewModeButton
            active={viewMode === "flat"}
            onClick={() => selectMode("flat")}
            icon={<AlertTriangle size={12} />}
            label="At risk"
          />
        </div>

        {viewMode === "default" && (
          <>
            <button
              type="button"
              onClick={expandAll}
              className="text-xs px-3 py-1.5 border border-[color:var(--card-border)] rounded-lg hover:bg-gray-50"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="text-xs px-3 py-1.5 border border-[color:var(--card-border)] rounded-lg hover:bg-gray-50"
            >
              Collapse all
            </button>
          </>
        )}
      </div>

      {/* Focus mode: target picker + breadcrumb */}
      {viewMode === "focus" && (
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-gray-500">Focused on:</span>
          <select
            value={focusTargetId ?? ""}
            onChange={(e) => setFocusTargetId(e.target.value || null)}
            className="border border-[color:var(--card-border)] rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]"
          >
            {focusTargets.length === 0 && <option value="">No focusable targets</option>}
            {focusTargets.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { setViewMode("default"); }}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 px-2 py-1"
          >
            <X size={12} />
            Exit focus
          </button>
          {focusTargetLabel && (
            <span className="text-[color:var(--text-muted)] ml-auto">
              All projects <span className="mx-1">/</span>{" "}
              <span className="text-[color:var(--text-primary)] font-medium">{focusTargetLabel}</span>
            </span>
          )}
        </div>
      )}

      {/* Flat at-risk mode */}
      {viewMode === "flat" ? (
        <div
          className="bg-[color:var(--card-bg)] rounded-[var(--card-radius)] border border-[color:var(--card-border)] overflow-hidden"
        >
          <div className="hidden md:flex items-center gap-2 pr-3 pl-[14px] py-2 bg-gray-50 border-b border-[color:var(--card-border)] text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <div className="w-[22px]" />
            <div className="flex-1">At-risk project</div>
            <div className="w-[80px] text-right">Progress</div>
            <div className="w-[90px] text-right">Δ Budget</div>
            <div className="w-[60px]" />
          </div>
          {atRiskItems.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              No at-risk projects. Everything is on track.
            </div>
          ) : (
            atRiskItems.map(({ node, breadcrumb }) => {
              const flatNode: TreeNode = {
                ...node,
                depth: 0,
                subtitle: breadcrumb || node.subtitle,
              };
              return (
                <div key={`flat:${node.id}`}>
                  <TreeRow node={flatNode} expanded={false} onToggle={() => {}} />
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div
          ref={treeRef}
          tabIndex={0}
          role="tree"
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (focusIndex === null && visible.length > 0) setFocusIndex(0);
          }}
          className="bg-[color:var(--card-bg)] rounded-[var(--card-radius)] border border-[color:var(--card-border)] overflow-hidden focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-blue)]/30"
        >
          <div className="hidden md:flex items-center gap-2 pr-3 pl-[14px] py-2 bg-gray-50 border-b border-[color:var(--card-border)] text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <div className="w-[22px]" />
            <div className="flex-1">Name</div>
            <div className="w-[90px] text-right">Active</div>
            <div className="w-[90px] text-right">At risk</div>
            <div className="w-[80px] text-right">Progress</div>
            <div className="w-[90px] text-right">Δ Budget</div>
            <div className="w-[60px]" />
          </div>

          {visible.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              No projects match your search.
            </div>
          ) : (
            visible.map((n, i) => {
              // In Rollup, drill-in should beat navigation for parent rows:
              // strip href on subdivision / land-dev-project so the row click
              // falls through to onToggle, which we route into Focus mode.
              const isDrillable =
                viewMode === "rollup" &&
                (n.kind === "subdivision" || n.kind === "land-dev-project");
              const displayNode = isDrillable ? { ...n, href: undefined } : n;
              return (
                <div
                  key={n.id}
                  data-row-index={i}
                  role="treeitem"
                  aria-expanded={n.children.length > 0 ? effectiveOpenIds.has(n.id) : undefined}
                  aria-level={n.depth + 1}
                  className={focusIndex === i ? "ring-2 ring-inset ring-[color:var(--brand-blue)]/40" : ""}
                >
                  <TreeRow
                    node={displayNode}
                    expanded={effectiveOpenIds.has(n.id)}
                    onToggle={() => {
                      if (viewMode === "rollup") {
                        if (isDrillable) {
                          setFocusTargetId(n.id);
                          setViewMode("focus");
                        }
                        return;
                      }
                      setFocusIndex(i);
                      toggle(n.id);
                    }}
                  />
                </div>
              );
            })
          )}
        </div>
      )}

      {viewMode === "default" && (
        <p className="text-[11px] text-gray-400 mt-2 hidden md:block">
          Tip: click the tree and use ↓ ↑ to move, → to expand, ← to collapse or jump to parent, Enter to open.
        </p>
      )}
      {viewMode === "rollup" && (
        <p className="text-[11px] text-gray-400 mt-2">
          Rollup view — sections collapsed to their summary only. Switch to Default to drill in.
        </p>
      )}
      {viewMode === "flat" && (
        <p className="text-[11px] text-gray-400 mt-2">
          Flat at-risk list — {atRiskItems.length} item{atRiskItems.length !== 1 ? "s" : ""} flagged delayed or over-budget.
        </p>
      )}
    </div>
  );
}

function ViewModeButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-3 py-1.5 transition-colors border-r last:border-r-0 border-[color:var(--card-border)] ${
        active
          ? "bg-[color:var(--tint-active)] text-[color:var(--brand-blue)] font-semibold"
          : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
