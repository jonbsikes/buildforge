"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import TreeRow from "./TreeRow";
import type { TreeNode, TreeRollup } from "@/lib/projects/tree";

const STORAGE_KEY = "projects.open";

interface ProjectsTreeProps {
  root: TreeNode[];
  orgRollup: TreeRollup;
}

function matchesSearch(node: TreeNode, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const selfMatch =
    node.name.toLowerCase().includes(lower) ||
    (node.subtitle?.toLowerCase().includes(lower) ?? false);
  return selfMatch || node.children.some((c) => matchesSearch(c, lower));
}

/**
 * Flatten visible nodes + build parent map, so keyboard nav can jump to parent.
 */
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

export default function ProjectsTree({ root, orgRollup }: ProjectsTreeProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const router = useRouter();
  const treeRef = useRef<HTMLDivElement>(null);

  // Load persisted state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setOpenIds(new Set(arr));
      } else {
        setOpenIds(new Set(root.map((n) => n.id)));
      }
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

  const { list: visible, parentOf } = useMemo(
    () => buildVisible(root, openIds, search),
    [root, openIds, search],
  );

  const orgNode: TreeNode = {
    id: "org",
    depth: 0,
    kind: "org",
    name: "All projects",
    subtitle: `${root.length} subdivision${root.length !== 1 ? "s" : ""}`,
    children: [],
    rollup: orgRollup,
  };

  const showOrgRow = root.length > 1;

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
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
        if (node && node.children.length > 0 && !openIds.has(node.id)) {
          toggle(node.id);
        } else if (node && node.children.length > 0) {
          // already expanded → step into first child
          setFocusIndex(Math.min(cur + 1, visible.length - 1));
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (node && node.children.length > 0 && openIds.has(node.id)) {
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
          toggle(node.id);
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
      </div>

      {/* Tree */}
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
        {/* Column headers — desktop only */}
        <div className="hidden md:flex items-center gap-2 pr-3 pl-[14px] py-2 bg-gray-50 border-b border-[color:var(--card-border)] text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          <div className="w-[22px]" />
          <div className="flex-1">Name</div>
          <div className="w-[90px] text-right">Active</div>
          <div className="w-[90px] text-right">At risk</div>
          <div className="w-[80px] text-right">Progress</div>
          <div className="w-[90px] text-right">Δ Budget</div>
          <div className="w-[60px]" />
        </div>

        {showOrgRow && (
          <TreeRow node={orgNode} expanded={false} onToggle={() => {}} />
        )}

        {visible.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            No projects match your search.
          </div>
        ) : (
          visible.map((n, i) => (
            <div
              key={n.id}
              data-row-index={i}
              role="treeitem"
              aria-expanded={n.children.length > 0 ? openIds.has(n.id) : undefined}
              aria-level={n.depth + 1}
              className={focusIndex === i ? "ring-2 ring-inset ring-[color:var(--brand-blue)]/40" : ""}
            >
              <TreeRow
                node={n}
                expanded={openIds.has(n.id)}
                onToggle={() => {
                  setFocusIndex(i);
                  toggle(n.id);
                }}
              />
            </div>
          ))
        )}
      </div>

      <p className="text-[11px] text-gray-400 mt-2 hidden md:block">
        Tip: click the tree and use ↓ ↑ to move, → to expand, ← to collapse or jump to parent, Enter to open.
      </p>
    </div>
  );
}
