"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, HardHat, Plus, DollarSign, Layers } from "lucide-react";
import { useRef, useState } from "react";
import QuickActionSheet from "./QuickActionSheet";
import NavSheet from "./NavSheet";
import { navSections, type NavSection } from "./navMap";

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE = 10;

type Tab = {
  key: string;
  label: string;
  href: string;
  sectionKey: NavSection["key"] | "more";
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
};

const tabs: Tab[] = [
  { key: "home", label: "Home", href: "/dashboard", sectionKey: "home", icon: Home },
  { key: "projects", label: "Projects", href: "/projects", sectionKey: "projects", icon: HardHat },
  // FAB goes here
  { key: "financial", label: "Financial", href: "/financial", sectionKey: "financial", icon: DollarSign },
  { key: "more", label: "More", href: "/manage", sectionKey: "more", icon: Layers },
];

function isTabActive(pathname: string, tab: Tab): boolean {
  if (tab.key === "home") return pathname === "/dashboard";
  if (tab.key === "projects") {
    return (
      pathname.startsWith("/projects") ||
      pathname.startsWith("/reports") ||
      pathname.startsWith("/todos") ||
      pathname.startsWith("/field-logs")
    );
  }
  if (tab.key === "financial") {
    return (
      pathname.startsWith("/financial") ||
      pathname.startsWith("/invoices") ||
      pathname.startsWith("/banking") ||
      pathname.startsWith("/draws") ||
      pathname.startsWith("/loans")
    );
  }
  if (tab.key === "more") {
    return (
      pathname.startsWith("/manage") ||
      pathname.startsWith("/vendors") ||
      pathname.startsWith("/contacts") ||
      pathname.startsWith("/documents") ||
      pathname.startsWith("/notifications") ||
      pathname.startsWith("/settings")
    );
  }
  return false;
}

export default function BottomTabBar() {
  const pathname = usePathname();
  const [showActions, setShowActions] = useState(false);
  const [sheetKey, setSheetKey] = useState<string | null>(null);

  // Long-press handling: a touch held ≥450ms on any tab opens its sheet,
  // regardless of active state. Short tap retains tap-to-navigate (or
  // tap-active-to-sheet) behavior.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function onTabTouchStart(e: React.TouchEvent, tab: Tab) {
    const t = e.touches[0];
    if (!t) return;
    longPressStart.current = { x: t.clientX, y: t.clientY };
    longPressFired.current = false;
    cancelLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setSheetKey(tab.sectionKey);
      // Haptic feedback on supported devices
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate?.(15); } catch {}
      }
    }, LONG_PRESS_MS);
  }

  function onTabTouchMove(e: React.TouchEvent) {
    const start = longPressStart.current;
    const t = e.touches[0];
    if (!start || !t) return;
    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);
    if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) {
      cancelLongPress();
    }
  }

  function onTabTouchEnd() {
    cancelLongPress();
    longPressStart.current = null;
  }

  function handleTabClick(e: React.MouseEvent, tab: Tab) {
    // If a long-press just fired, suppress the synthetic click.
    if (longPressFired.current) {
      e.preventDefault();
      longPressFired.current = false;
      return;
    }
    const active = isTabActive(pathname, tab);
    // Tap on already-active tab (or "More" always) opens sheet
    if (active || tab.sectionKey === "more") {
      e.preventDefault();
      setSheetKey(tab.sectionKey);
    }
  }

  const sheetSection =
    sheetKey
      ? navSections.find((s) => s.key === sheetKey) ??
        // For "more", use the manage section content
        (sheetKey === "more" ? navSections.find((s) => s.key === "manage") : null) ??
        null
      : null;

  return (
    <>
      <nav
        data-bottom-tab-bar
        className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 px-2 pt-1.5 pb-safe"
      >
        <div className="flex items-end justify-around max-w-lg mx-auto">
          {tabs.slice(0, 2).map((tab) => {
            const active = isTabActive(pathname, tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                onClick={(e) => handleTabClick(e, tab)}
                onTouchStart={(e) => onTabTouchStart(e, tab)}
                onTouchMove={onTabTouchMove}
                onTouchEnd={onTabTouchEnd}
                onTouchCancel={onTabTouchEnd}
                onContextMenu={(e) => e.preventDefault()}
                className="flex flex-col items-center gap-0.5 py-1 px-3 min-w-0 select-none"
              >
                <Icon
                  size={22}
                  className={active ? "text-[color:var(--brand-blue)]" : "text-gray-400"}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span
                  className={`text-xs ${active ? "text-[color:var(--brand-blue)] font-semibold" : "text-gray-400"}`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}

          {/* Center FAB */}
          <button
            onClick={() => setShowActions(true)}
            className="relative -mt-5 flex flex-col items-center"
            aria-label="Quick actions"
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              style={{
                backgroundColor: "var(--brand-blue)",
                boxShadow: "0 10px 20px -5px rgba(66,114,239,.4)",
              }}
            >
              <Plus size={26} color="white" strokeWidth={2.5} />
            </div>
          </button>

          {tabs.slice(2).map((tab) => {
            const active = isTabActive(pathname, tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                onClick={(e) => handleTabClick(e, tab)}
                onTouchStart={(e) => onTabTouchStart(e, tab)}
                onTouchMove={onTabTouchMove}
                onTouchEnd={onTabTouchEnd}
                onTouchCancel={onTabTouchEnd}
                onContextMenu={(e) => e.preventDefault()}
                className="flex flex-col items-center gap-0.5 py-1 px-3 min-w-0 select-none"
              >
                <Icon
                  size={22}
                  className={active ? "text-[color:var(--brand-blue)]" : "text-gray-400"}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span
                  className={`text-xs ${active ? "text-[color:var(--brand-blue)] font-semibold" : "text-gray-400"}`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {showActions && <QuickActionSheet onClose={() => setShowActions(false)} />}

      {sheetSection && (
        <NavSheet
          section={sheetSection}
          onClose={() => setSheetKey(null)}
          fullNav={sheetKey === "more"}
        />
      )}
    </>
  );
}
