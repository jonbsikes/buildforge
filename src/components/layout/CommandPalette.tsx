"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, Receipt, Users, FileText, X, ArrowRight } from "lucide-react";
import { navSections } from "./navMap";

type Hit = {
  id: string;
  kind: "project" | "vendor" | "invoice" | "contact" | "nav";
  label: string;
  sublabel?: string | null;
  href: string;
};

const KIND_ICON = {
  project: Building2,
  vendor: Users,
  invoice: Receipt,
  contact: Users,
  nav: ArrowRight,
} as const;

const KIND_LABEL = {
  project: "Project",
  vendor: "Vendor",
  invoice: "Invoice",
  contact: "Contact",
  nav: "Navigation",
} as const;

/**
 * Cmd+K command palette. Per UI Review § 02 #14.
 *
 * Keyboard:
 *   Cmd/Ctrl+K — open
 *   Esc        — close
 *   ↑ / ↓      — move
 *   Enter      — select
 *   /          — focus from anywhere
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Static navigation entries — always available even with empty query.
  const navHits = useMemo<Hit[]>(() => {
    const list: Hit[] = [];
    for (const sec of navSections) {
      list.push({
        id: `nav:${sec.key}`,
        kind: "nav",
        label: sec.label,
        sublabel: "Section",
        href: sec.href,
      });
      for (const sub of sec.subNav) {
        list.push({
          id: `nav:${sec.key}:${sub.href}`,
          kind: "nav",
          label: sub.label,
          sublabel: sec.label,
          href: sub.href,
        });
      }
    }
    return list;
  }, []);

  // Toggle on Cmd/Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isToggle) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" focuses palette when not in an input/textarea
      if (
        e.key === "/" &&
        !open &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        !(document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
      ) {
        e.preventDefault();
        setOpen(true);
      }
      if (open && e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Reset active index when hits change
  useEffect(() => {
    setActive(0);
  }, [hits]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQ("");
      setHits([]);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setHits(data.hits ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 140);
  }, [q]);

  const navMatches = useMemo(() => {
    if (!q.trim()) return navHits.slice(0, 6);
    const lower = q.toLowerCase();
    return navHits.filter((h) =>
      h.label.toLowerCase().includes(lower) || (h.sublabel ?? "").toLowerCase().includes(lower)
    );
  }, [q, navHits]);

  const allHits = useMemo<Hit[]>(() => [...hits, ...navMatches], [hits, navMatches]);

  const select = useCallback(
    (hit: Hit) => {
      setOpen(false);
      router.push(hit.href);
    },
    [router]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      role="dialog"
      aria-modal
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-black/30 animate-fade-in"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-xl bg-white rounded-xl border border-[color:var(--card-border)] shadow-2xl animate-slide-right overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[color:var(--border-weak)]">
          <Search size={16} className="text-[color:var(--text-muted)]" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects, vendors, invoices, contacts…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-[color:var(--text-muted)]"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(allHits.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const hit = allHits[active];
                if (hit) select(hit);
              }
            }}
          />
          <button
            onClick={() => setOpen(false)}
            className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {allHits.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-[color:var(--text-muted)]">
              {loading ? "Searching…" : q ? "No matches." : "Type to search."}
            </div>
          ) : (
            <ul className="py-1">
              {allHits.map((hit, i) => {
                const Icon = KIND_ICON[hit.kind];
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => select(hit)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        active === i
                          ? "bg-[color:var(--surface-secondary)]"
                          : ""
                      }`}
                    >
                      <Icon size={14} className="text-[color:var(--text-muted)] flex-shrink-0" aria-hidden />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[color:var(--text-primary)] truncate">
                          {hit.label}
                        </div>
                        {hit.sublabel && (
                          <div className="text-[11px] text-[color:var(--text-muted)] truncate">
                            {hit.sublabel}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] font-semibold">
                        {KIND_LABEL[hit.kind]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[color:var(--border-weak)] px-4 py-2 flex items-center gap-4 text-[10px] text-[color:var(--text-muted)]">
          <span><kbd className="font-mono">↑ ↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto">Cmd/Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
