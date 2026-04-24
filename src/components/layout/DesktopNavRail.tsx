"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { GripVertical, X } from "lucide-react";
import { navSections, type NavSection } from "./navMap";
import { usePinnedProjects } from "@/lib/usePinnedProjects";

function isActive(pathname: string, section: NavSection): boolean {
  if (section.key === "home") return pathname === "/dashboard";
  return section.matchPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

const PINNED_KEY = "nav.pinned";

interface PinnedProject {
  id: string;
  name: string;
  subdivision: string | null;
}

export default function DesktopNavRail() {
  const pathname = usePathname();
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [pinnedProjects, setPinnedProjects] = useState<PinnedProject[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Hydrate pinned state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      if (raw) setPinnedKey(raw);
    } catch {}
  }, []);

  const { ids: pinnedIds, toggle: togglePin, reorder: reorderPin } = usePinnedProjects();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Load projects that match currently-pinned ids
  useEffect(() => {
    let cancel = false;
    if (pinnedIds.length === 0) {
      setPinnedProjects([]);
      return;
    }
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase
          .from("projects")
          .select("id, name, subdivision")
          .in("id", pinnedIds);
        if (!cancel && data) setPinnedProjects(data as PinnedProject[]);
      } catch {}
    })();
    return () => {
      cancel = true;
    };
  }, [pinnedIds]);

  // Order pinned projects by the stored pin order
  const orderedPinned = useMemo(() => {
    const byId = new Map(pinnedProjects.map((p) => [p.id, p]));
    return pinnedIds.map((id) => byId.get(id)).filter((p): p is PinnedProject => !!p);
  }, [pinnedIds, pinnedProjects]);

  // Escape / outside click unpins
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinnedKey(null);
        setHoverKey(null);
        try {
          localStorage.removeItem(PINNED_KEY);
        } catch {}
      }
    }
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPinnedKey(null);
        try {
          localStorage.removeItem(PINNED_KEY);
        } catch {}
      }
    }
    if (pinnedKey) {
      document.addEventListener("keydown", onKey);
      document.addEventListener("mousedown", onDown);
      return () => {
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("mousedown", onDown);
      };
    }
  }, [pinnedKey]);

  const openKey = pinnedKey ?? hoverKey;
  const openSection = openKey ? navSections.find((s) => s.key === openKey) : null;

  function handleEnter(key: string) {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHoverKey(key);
  }

  function handleLeave() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHoverKey(null), 200);
  }

  function handleClick(key: string) {
    const next = pinnedKey === key ? null : key;
    setPinnedKey(next);
    try {
      if (next) localStorage.setItem(PINNED_KEY, next);
      else localStorage.removeItem(PINNED_KEY);
    } catch {}
  }

  return (
    <div ref={rootRef} className="hidden lg:flex h-screen relative z-30">
      {/* Icon Rail */}
      <div
        className="w-16 bg-gray-900 flex flex-col items-center py-4 gap-1 shrink-0"
        onMouseLeave={handleLeave}
      >
        <Link
          href="/dashboard"
          className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center mb-4 hover:opacity-90 transition-opacity bg-white"
        >
          <Image
            src="/prairie-sky-logo.png"
            alt="Prairie Sky Homes"
            width={44}
            height={44}
            className="w-11 h-11 object-contain"
            priority
          />
        </Link>

        {navSections.map((section) => {
          const active = isActive(pathname, section);
          const isHover = openKey === section.key;
          const Icon = section.icon;
          return (
            <Link
              key={section.key}
              href={section.href}
              onMouseEnter={() => handleEnter(section.key)}
              onClick={() => handleClick(section.key)}
              className={`relative w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active
                  ? "text-white"
                  : isHover
                  ? "text-[color:var(--brand-blue)] bg-white/5"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-sm"
                  style={{ backgroundColor: "var(--brand-blue)" }}
                />
              )}
              <Icon
                size={20}
                strokeWidth={active ? 2.4 : 1.8}
                className={active ? "text-[color:var(--brand-blue)]" : undefined}
              />
              <span
                className="text-[9px] font-medium leading-tight"
                style={active ? { color: "var(--brand-blue)" } : undefined}
              >
                {section.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Flyout */}
      {openSection && (
        <div
          onMouseEnter={() => {
            if (closeTimer.current) {
              clearTimeout(closeTimer.current);
              closeTimer.current = null;
            }
          }}
          onMouseLeave={handleLeave}
          className="w-60 h-screen flex flex-col"
          style={{ backgroundColor: "#1E293B", animation: "slide-right 120ms ease-out" }}
        >
          <div className="px-4 py-4 border-b border-[#334155]">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "#64748B" }}
            >
              {openSection.label}
            </p>
          </div>
          <nav className="flex-1 overflow-y-auto py-2">
            {openSection.subNav.map((item) => {
              const isItemActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center h-9 px-4 text-[13px] transition-colors"
                  style={{
                    color: isItemActive ? "#BFD1FD" : "#CBD5E1",
                    backgroundColor: isItemActive ? "rgba(66,114,239,.22)" : undefined,
                  }}
                >
                  {item.label}
                </Link>
              );
            })}

            {orderedPinned.length > 0 && (
              <>
                <div className="mx-4 my-3 h-px bg-[#334155]" />
                <p
                  className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "#64748B" }}
                >
                  Pinned
                </p>
                {orderedPinned.map((p, idx) => {
                  const isDragging = dragIndex === idx;
                  const isOver = dragOverIndex === idx && dragIndex !== null && dragIndex !== idx;
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        setDragIndex(idx);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverIndex !== idx) setDragOverIndex(idx);
                      }}
                      onDragLeave={() => {
                        if (dragOverIndex === idx) setDragOverIndex(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIndex !== null && dragIndex !== idx) {
                          reorderPin(dragIndex, idx);
                        }
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      className="group flex items-start gap-1.5 px-2 py-1.5 hover:bg-white/5"
                      style={{
                        opacity: isDragging ? 0.4 : 1,
                        borderTop: isOver ? "2px solid var(--brand-blue)" : "2px solid transparent",
                        cursor: "grab",
                      }}
                    >
                      <GripVertical
                        size={12}
                        className="mt-0.5 shrink-0 opacity-40 group-hover:opacity-80"
                        style={{ color: "#CBD5E1" }}
                      />
                      <Link
                        href={`/projects/${p.id}`}
                        className="flex-1 min-w-0 text-[13px]"
                        style={{ color: "#CBD5E1" }}
                      >
                        <div className="truncate">{p.name}</div>
                        {p.subdivision && (
                          <div className="text-[11px] truncate" style={{ color: "#64748B" }}>
                            {p.subdivision}
                          </div>
                        )}
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          togglePin(p.id);
                        }}
                        aria-label="Unpin project"
                        title="Unpin"
                        className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
                      >
                        <X size={12} style={{ color: "#CBD5E1" }} />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
