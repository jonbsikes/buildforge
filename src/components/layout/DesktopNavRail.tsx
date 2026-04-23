"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Home, Building2, DollarSign, Layers } from "lucide-react";

type SubNav = { label: string; href: string };

type RailSection = {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  href: string;
  matchPaths: string[];
  subNav: SubNav[];
};

const sections: RailSection[] = [
  {
    key: "home",
    label: "Home",
    icon: Home,
    href: "/dashboard",
    matchPaths: ["/dashboard"],
    subNav: [
      { label: "Overview", href: "/dashboard" },
      { label: "Notifications", href: "/notifications" },
      { label: "To-dos", href: "/todos" },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    icon: Building2,
    href: "/projects",
    matchPaths: ["/projects", "/reports", "/todos", "/field-logs"],
    subNav: [
      { label: "All projects", href: "/projects" },
      { label: "Projects hub", href: "/projects/hub" },
      { label: "Reports", href: "/reports" },
      { label: "Field logs", href: "/field-logs" },
      { label: "To-dos", href: "/todos" },
    ],
  },
  {
    key: "financial",
    label: "Financial",
    icon: DollarSign,
    href: "/financial",
    matchPaths: ["/financial", "/invoices", "/banking", "/draws", "/loans"],
    subNav: [
      { label: "Summary", href: "/financial" },
      { label: "Accounts payable", href: "/invoices" },
      { label: "Banking", href: "/banking/accounts" },
      { label: "Loans", href: "/banking/loans" },
      { label: "Draws", href: "/draws" },
    ],
  },
  {
    key: "manage",
    label: "Manage",
    icon: Layers,
    href: "/manage",
    matchPaths: ["/manage", "/vendors", "/contacts", "/documents", "/settings"],
    subNav: [
      { label: "Vendors", href: "/vendors" },
      { label: "Contacts", href: "/contacts" },
      { label: "Documents", href: "/documents" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

function isActive(pathname: string, section: RailSection): boolean {
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

  // Load recently-touched projects (one-shot)
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase
          .from("projects")
          .select("id, name, subdivision")
          .order("created_at", { ascending: false })
          .limit(5);
        if (!cancel && data) setPinnedProjects(data as PinnedProject[]);
      } catch {}
    })();
    return () => {
      cancel = true;
    };
  }, []);

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
  const openSection = openKey ? sections.find((s) => s.key === openKey) : null;

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

        {sections.map((section) => {
          const active = isActive(pathname, section);
          const isHover = openKey === section.key;
          const Icon = section.icon;
          return (
            <Link
              key={section.key}
              href={section.href}
              onMouseEnter={() => handleEnter(section.key)}
              onClick={() => handleClick(section.key)}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active || isHover
                  ? "bg-[color:var(--brand-blue)]/20 text-[color:var(--brand-blue)]"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-[9px] font-medium leading-tight">{section.label}</span>
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

            {pinnedProjects.length > 0 && (
              <>
                <div className="mx-4 my-3 h-px bg-[#334155]" />
                <p
                  className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "#64748B" }}
                >
                  Pinned
                </p>
                {pinnedProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="block px-4 py-1.5 text-[13px] hover:bg-white/5"
                    style={{ color: "#CBD5E1" }}
                  >
                    <div className="truncate">{p.name}</div>
                    {p.subdivision && (
                      <div className="text-[11px] truncate" style={{ color: "#64748B" }}>
                        {p.subdivision}
                      </div>
                    )}
                  </Link>
                ))}
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
