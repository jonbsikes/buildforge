"use client";

import { useState, useMemo, useEffect } from "react";
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

function flattenVisible(
  nodes: TreeNode[],
  openIds: Set<string>,
  search: string,
): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (!matchesSearch(n, search)) continue;
    out.push(n);
    if (n.children.length > 0 && (openIds.has(n.id) || search !== "")) {
      out.push(...flattenVisible(n.children, openIds, search));
    }
  }
  return out;
}

export default function ProjectsTree({ root, orgRollup }: ProjectsTreeProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Load persisted state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setOpenIds(new Set(arr));
      } else {
        // Default: expand first level
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

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const visible = useMemo(
    () => flattenVisible(root, openIds, search),
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
      <div className="bg-[color:var(--card-bg)] rounded-[var(--card-radius)] border border-[color:var(--card-border)] overflow-hidden">
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
          visible.map((n) => (
            <TreeRow
              key={n.id}
              node={n}
              expanded={openIds.has(n.id)}
              onToggle={() => toggle(n.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
