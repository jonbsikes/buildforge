"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Home,
  Building2,
  DollarSign,
  Layers,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserRole } from "./UserRoleContext";

type SubItem = {
  key: string;
  href: string;
  label: string;
  divider?: boolean;
};

type RailSection = {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  href?: string; // Direct link (no flyout)
  children?: SubItem[];
};

const sections: RailSection[] = [
  {
    key: "home",
    label: "Home",
    icon: Home,
    href: "/dashboard",
  },
  {
    key: "projects",
    label: "Projects",
    icon: Building2,
    children: [
      { key: "all-projects", href: "/projects", label: "All Projects" },
      { key: "todos", href: "/todos", label: "To-Do List" },
      { key: "field-logs", href: "/field-logs", label: "Field Logs" },
      { key: "divider-reports", href: "", label: "Reports", divider: true },
      { key: "stage-progress", href: "/reports/stage-progress", label: "Stage Progress" },
      { key: "gantt-report", href: "/reports/gantt", label: "Gantt Report" },
      { key: "job-cost", href: "/reports/job-cost", label: "Job Cost" },
      { key: "budget-variance", href: "/reports/budget-variance", label: "Budget Variance" },
      { key: "selections", href: "/reports/selections", label: "Selections" },
    ],
  },
  {
    key: "financial",
    label: "Financial",
    icon: DollarSign,
    children: [
      { key: "invoices", href: "/invoices", label: "Accounts Payable" },
      { key: "journal-entries", href: "/financial/journal-entries", label: "Journal Entries" },
      { key: "divider-banking", href: "", label: "Banking", divider: true },
      { key: "bank-accounts", href: "/banking/accounts", label: "Bank Accounts" },
      { key: "loans", href: "/banking/loans", label: "Loans" },
      { key: "payments", href: "/banking/payments", label: "Payment Register" },
      { key: "draws", href: "/draws", label: "Draw Requests" },
      { key: "divider-reports", href: "", label: "Reports", divider: true },
      { key: "fin-summary", href: "/financial/summary", label: "Summary" },
      { key: "income-stmt", href: "/financial/income-statement", label: "Income Statement" },
      { key: "balance-sheet", href: "/financial/balance-sheet", label: "Balance Sheet" },
      { key: "cash-flow", href: "/financial/cash-flow", label: "Cash Flow" },
      { key: "ap-aging", href: "/financial/ap-aging", label: "AP Aging" },
      { key: "wip", href: "/financial/wip", label: "WIP Report" },
      { key: "vendor-spend", href: "/financial/vendor-spend", label: "Vendor Spend" },
      { key: "tax-export", href: "/financial/tax-export", label: "Tax Package Export" },
    ],
  },
  {
    key: "manage",
    label: "Manage",
    icon: Layers,
    children: [
      { key: "vendors", href: "/vendors", label: "Vendors" },
      { key: "contacts", href: "/contacts", label: "Contacts" },
      { key: "documents", href: "/documents", label: "Documents" },
    ],
  },
];

function isActive(pathname: string, section: RailSection): boolean {
  if (section.href) {
    return pathname === section.href || pathname.startsWith(section.href + "/");
  }
  if (section.children) {
    return section.children.some(
      (c) => !c.divider && (pathname === c.href || pathname.startsWith(c.href + "/"))
    );
  }
  return false;
}

function isChildActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function DesktopNavRail() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { isAdmin } = useUserRole();
  const [flyout, setFlyout] = useState<string | null>(null);
  const flyoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Close flyout when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        setFlyout(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close flyout on route change
  useEffect(() => {
    setFlyout(null);
  }, [pathname]);

  function handleMouseEnter(key: string) {
    if (flyoutTimeoutRef.current) clearTimeout(flyoutTimeoutRef.current);
    setFlyout(key);
  }

  function handleMouseLeave() {
    flyoutTimeoutRef.current = setTimeout(() => setFlyout(null), 200);
  }

  function handleFlyoutMouseEnter() {
    if (flyoutTimeoutRef.current) clearTimeout(flyoutTimeoutRef.current);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={railRef} className="hidden lg:flex h-screen relative z-30" onMouseLeave={handleMouseLeave}>
      {/* Icon Rail */}
      <div className="w-16 bg-gray-900 flex flex-col items-center py-4 gap-1 shrink-0">
        {/* Logo mark */}
        <Link href="/dashboard" className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center mb-4 hover:opacity-90 transition-opacity bg-white">
          <Image
            src="/prairie-sky-logo.png"
            alt="Prairie Sky Homes"
            width={44}
            height={44}
            className="w-11 h-11 object-contain"
            priority
          />
        </Link>

        {/* Nav sections */}
        {sections.map((section) => {
          const active = isActive(pathname, section);
          const Icon = section.icon;

          if (section.href) {
            return (
              <Link
                key={section.key}
                href={section.href}
                className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active
                    ? "bg-[#4272EF]/20 text-[#4272EF]"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[9px] font-medium leading-tight">{section.label}</span>
              </Link>
            );
          }

          return (
            <button
              key={section.key}
              onClick={() => setFlyout(flyout === section.key ? null : section.key)}
              onMouseEnter={() => handleMouseEnter(section.key)}
              className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active
                  ? "bg-[#4272EF]/20 text-[#4272EF]"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-[9px] font-medium leading-tight">{section.label}</span>
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut size={18} />
          <span className="text-[9px] font-medium">Sign out</span>
        </button>
      </div>

      {/* Flyout Panel */}
      {flyout && (
        <div
          className="w-64 bg-gray-800 border-r border-gray-700 py-4 px-3 shrink-0 animate-slide-right"
          onMouseEnter={handleFlyoutMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex items-center justify-between px-3 mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {sections.find((s) => s.key === flyout)?.label}
            </h3>
            {flyout === "financial" && !isAdmin && (
              <span className="text-[9px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
                View Only
              </span>
            )}
          </div>
          <div className="space-y-0.5">
            {sections
              .find((s) => s.key === flyout)
              ?.children?.map((child) => {
                if (child.divider) {
                  return (
                    <div key={child.key} className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-3 pt-4 pb-1">
                      {child.label}
                    </div>
                  );
                }
                const active = isChildActive(pathname, child.href);
                return (
                  <Link
                    key={child.key}
                    href={child.href}
                    className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? "bg-[#4272EF]/20 text-[#4272EF] font-medium"
                        : "text-gray-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {child.label}
                  </Link>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
