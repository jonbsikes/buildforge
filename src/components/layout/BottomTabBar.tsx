"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, HardHat, Plus, DollarSign, Layers } from "lucide-react";
import { useState } from "react";
import QuickActionSheet from "./QuickActionSheet";

type Tab = {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
};

const tabs: Tab[] = [
  { key: "home", label: "Home", href: "/dashboard", icon: Home },
  { key: "projects", label: "Projects", href: "/projects/hub", icon: HardHat },
  // FAB goes here (handled separately)
  { key: "financial", label: "Financial", href: "/financial", icon: DollarSign },
  { key: "more", label: "More", href: "/manage", icon: Layers },
];

function isTabActive(pathname: string, tab: Tab): boolean {
  if (tab.key === "home") return pathname === "/dashboard";
  if (tab.key === "projects") {
    return pathname.startsWith("/projects") ||
      pathname.startsWith("/reports") ||
      pathname.startsWith("/todos") ||
      pathname.startsWith("/field-logs");
  }
  if (tab.key === "financial") {
    return pathname.startsWith("/financial") ||
      pathname.startsWith("/invoices") ||
      pathname.startsWith("/banking") ||
      pathname.startsWith("/draws") ||
      pathname.startsWith("/loans");
  }
  if (tab.key === "more") {
    return pathname.startsWith("/manage") ||
      pathname.startsWith("/vendors") ||
      pathname.startsWith("/contacts") ||
      pathname.startsWith("/documents") ||
      pathname.startsWith("/notifications") ||
      pathname.startsWith("/settings");
  }
  return false;
}

export default function BottomTabBar() {
  const pathname = usePathname();
  const [showActions, setShowActions] = useState(false);

  return (
    <>
      <nav data-bottom-tab-bar className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 px-2 pt-1.5 pb-safe">
        <div className="flex items-end justify-around max-w-lg mx-auto">
          {/* First two tabs */}
          {tabs.slice(0, 2).map((tab) => {
            const active = isTabActive(pathname, tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className="flex flex-col items-center gap-0.5 py-1 px-3 min-w-0"
              >
                <Icon
                  size={22}
                  className={active ? "text-[#4272EF]" : "text-gray-400"}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span className={`text-xs ${active ? "text-[#4272EF] font-semibold" : "text-gray-400"}`}>
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
            <div className="w-14 h-14 rounded-full bg-[#4272EF] flex items-center justify-center shadow-lg shadow-[#4272EF]/30 active:scale-95 transition-transform">
              <Plus size={26} color="white" strokeWidth={2.5} />
            </div>
          </button>

          {/* Last two tabs */}
          {tabs.slice(2).map((tab) => {
            const active = isTabActive(pathname, tab);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className="flex flex-col items-center gap-0.5 py-1 px-3 min-w-0"
              >
                <Icon
                  size={22}
                  className={active ? "text-[#4272EF]" : "text-gray-400"}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span className={`text-xs ${active ? "text-[#4272EF] font-semibold" : "text-gray-400"}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Quick Action Sheet */}
      {showActions && <QuickActionSheet onClose={() => setShowActions(false)} />}
    </>
  );
}
