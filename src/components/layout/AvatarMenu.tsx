"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, LogOut, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface AvatarMenuProps {
  displayName: string;
  initials: string;
  email: string;
}

export default function AvatarMenu({ displayName, initials, email }: AvatarMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-3 lg:pl-4 border-l border-gray-200"
        aria-label="Account menu"
      >
        <span className="text-sm text-gray-600 font-medium hidden sm:block">
          {displayName}
        </span>
        <div
          className="w-8 h-8 lg:w-9 lg:h-9 rounded-full flex items-center justify-center text-white font-medium text-sm"
          style={{ backgroundColor: "var(--brand-blue)" }}
        >
          {initials}
        </div>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-[color:var(--card-border)] py-1 z-50">
          <div className="px-3 py-2 border-b border-[color:var(--border-hair)]">
            <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
            <p className="text-xs text-gray-500 truncate">{email}</p>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <User size={14} className="text-gray-400" /> My profile
          </Link>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Bell size={14} className="text-gray-400" /> Notifications
          </Link>
          <div className="border-t border-[color:var(--border-hair)] my-1" />
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
            style={{ color: "var(--status-over)" }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
