"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { NavSection } from "./navMap";
import { createClient } from "@/lib/supabase/client";

interface PinnedProject {
  id: string;
  name: string;
  subdivision: string | null;
}

export interface NavSheetProps {
  section: NavSection;
  onClose: () => void;
  /** If true, render as full-nav sheet (includes sign out). Used for "More" tab. */
  fullNav?: boolean;
}

const SWIPE_DISMISS_THRESHOLD = 70; // px
const SWIPE_HORIZONTAL_TOLERANCE = 40; // px

export default function NavSheet({ section, onClose, fullNav }: NavSheetProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [pinned, setPinned] = useState<PinnedProject[]>([]);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("projects")
          .select("id, name, subdivision")
          .order("created_at", { ascending: false })
          .limit(3);
        if (!cancel && data) setPinned(data as PinnedProject[]);
      } catch {}
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    onClose();
    router.push("/login");
    router.refresh();
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    dragStart.current = { x: t.clientX, y: t.clientY };
    setDragOffset(0);
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = dragStart.current;
    const t = e.touches[0];
    if (!start || !t) return;
    const dy = t.clientY - start.y;
    const dx = Math.abs(t.clientX - start.x);
    // Ignore if primarily a horizontal gesture (e.g. scrolling inline).
    if (dx > SWIPE_HORIZONTAL_TOLERANCE) {
      setDragOffset(0);
      return;
    }
    // Only track downward drag.
    if (dy > 0) setDragOffset(dy);
  }

  function onTouchEnd() {
    if (dragOffset >= SWIPE_DISMISS_THRESHOLD) {
      onClose();
    } else {
      setDragOffset(0);
    }
    dragStart.current = null;
  }

  return (
    <>
      <div
        className="lg:hidden fixed inset-0 z-[60] animate-fade-in"
        style={{ backgroundColor: "rgba(15,23,42,.35)" }}
        onClick={onClose}
      />
      <div
        className="lg:hidden fixed left-0 right-0 z-[61] bg-white animate-slide-up"
        style={{
          bottom: 58,
          borderRadius: "16px 16px 0 0",
          boxShadow: "0 -4px 20px rgba(0,0,0,.12)",
          maxHeight: "60vh",
          overflowY: "auto",
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: dragOffset > 0 ? "none" : "transform 180ms ease-out",
        }}
      >
        {/* Drag handle (also the swipe-down grip area) */}
        <div
          className="flex justify-center pt-2 pb-2 touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div
            className="w-9 h-1 rounded"
            style={{ backgroundColor: "var(--border-strong)" }}
          />
        </div>

        <div className="px-4 pb-4">
          <p
            className="text-[9px] font-semibold uppercase tracking-[0.12em] mb-2 mt-1"
            style={{ color: "#94A3B8" }}
          >
            {section.label}
          </p>

          {section.subNav.map((item) => {
            const isItemActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="flex items-center h-9 px-2.5 rounded text-[13px] font-medium"
                style={{
                  color: isItemActive ? "#2E5BD8" : "#334155",
                  backgroundColor: isItemActive ? "rgba(66,114,239,.1)" : undefined,
                  fontWeight: isItemActive ? 500 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}

          {pinned.length > 0 && (
            <>
              <div className="h-px bg-[color:var(--border-hair)] my-3" />
              <p
                className="text-[9px] font-semibold uppercase tracking-[0.12em] mb-1.5"
                style={{ color: "#94A3B8" }}
              >
                Pinned
              </p>
              {pinned.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  onClick={onClose}
                  className="block px-2.5 py-1.5 rounded hover:bg-gray-50"
                >
                  <div className="text-[13px] text-gray-800 truncate">{p.name}</div>
                  {p.subdivision && (
                    <div className="text-[11px] text-gray-400 truncate">{p.subdivision}</div>
                  )}
                </Link>
              ))}
            </>
          )}

          {fullNav && (
            <>
              <div className="h-px bg-[color:var(--border-hair)] my-3" />
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded text-[13px] font-medium"
                style={{ color: "var(--status-over)" }}
              >
                <LogOut size={14} /> Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
