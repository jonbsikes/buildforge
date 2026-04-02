"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Building2,
  BarChart2,
  ClipboardList,
  TrendingUp,
  Receipt,
  Banknote,
  Folder,
  Truck,
  Users,
  ChevronDown,
  ChevronRight,
  BookOpen,
  LogOut,
  X,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";
import { createClient } from "@/lib/supabase/client";

type SubItem = { href: string; label: string };

type NavLink = {
  type: "link";
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type NavGroup = {
  type: "group";
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: SubItem[];
};

type NavEntry = NavLink | NavGroup;

type NavSection = {
  title: string;
  entries: NavEntry[];
};

const sections: NavSection[] = [
  {
    title: "Overview",
    entries: [
      { type: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { type: "link", href: "/todos", label: "To-Do List", icon: ClipboardList },
    ],
  },
  {
    title: "Project Management",
    entries: [
      { type: "link", href: "/projects", label: "Projects", icon: Building2 },
      {
        type: "group",
        key: "project-reports",
        label: "Project Reports",
        icon: BarChart2,
        children: [
          { href: "/reports/stage-progress",  label: "Stage Progress" },
          { href: "/reports/gantt",            label: "Gantt Report" },
          { href: "/reports/job-cost",         label: "Job Cost" },
          { href: "/reports/budget-variance",  label: "Budget Variance" },
          { href: "/reports/selections",       label: "Selections" },
        ],
      },
    ],
  },
  {
    title: "Financial",
    entries: [
      {
        type: "group",
        key: "financial-reports",
        label: "Financial Reports",
        icon: TrendingUp,
        children: [
          { href: "/financial/summary",         label: "Summary" },
          { href: "/financial/income-statement", label: "Income Statement" },
          { href: "/financial/balance-sheet",    label: "Balance Sheet" },
          { href: "/financial/cash-flow",        label: "Cash Flow Statement" },
          { href: "/financial/ap-aging",         label: "AP Aging" },
          { href: "/financial/wip",              label: "WIP Report" },
          { href: "/financial/vendor-spend",     label: "Vendor Spend" },
          { href: "/financial/tax-export",       label: "Tax Package Export" },
        ],
      },
      { type: "link", href: "/financial/journal-entries", label: "Journal Entries", icon: BookOpen },
      { type: "link", href: "/invoices",   label: "Accounts Payable", icon: Receipt },
      {
        type: "group",
        key: "banking",
        label: "Banking",
        icon: Banknote,
        children: [
          { href: "/banking/accounts", label: "Bank Accounts" },
          { href: "/banking/loans", label: "Loans" },
          { href: "/draws", label: "Draw Requests" },
        ],
      },
    ],
  },
  {
    title: "Management",
    entries: [
      { type: "link", href: "/documents", label: "Documents", icon: Folder },
      { type: "link", href: "/vendors", label: "Vendors", icon: Truck },
      { type: "link", href: "/contacts", label: "Contacts", icon: Users },
    ],
  },
];

function isLinkActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function isGroupActive(pathname: string, children: SubItem[]) {
  return children.some((c) => isLinkActive(pathname, c.href));
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { isOpen, close } = useSidebar();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Auto-expand groups whose child matches the current path
  useEffect(() => {
    const autoOpen: Record<string, boolean> = {};
    for (const section of sections) {
      for (const entry of section.entries) {
        if (entry.type === "group" && isGroupActive(pathname, entry.children)) {
          autoOpen[entry.key] = true;
        }
      }
    }
    setOpenGroups((prev) => ({ ...prev, ...autoOpen }));
  }, [pathname]);

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="bg-white flex items-center justify-between">
        <Image
          src="/prairie-sky-logo.png"
          alt="Prairie Sky Homes"
          width={240}
          height={120}
          className="w-full h-auto object-contain p-3"
          priority
        />
        <button
          onClick={close}
          className="lg:hidden p-3 text-gray-400 hover:text-white flex-shrink-0"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {section.title}
              </p>

              <div className="space-y-0.5">
                {section.entries.map((entry) => {
                  if (entry.type === "link") {
                    const active = isLinkActive(pathname, entry.href);
                    const Icon = entry.icon;
                    return (
                      <Link
                        key={entry.href}
                        href={entry.href}
                        onClick={close}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          active
                            ? "bg-[#4272EF] text-white"
                            : "text-gray-400 hover:text-white hover:bg-gray-800"
                        }`}
                      >
                        <Icon size={16} />
                        {entry.label}
                      </Link>
                    );
                  }

                  // Expandable group
                  const groupActive = isGroupActive(pathname, entry.children);
                  const isOpen = openGroups[entry.key] ?? false;
                  const Icon = entry.icon;

                  return (
                    <div key={entry.key}>
                      <button
                        onClick={() => toggleGroup(entry.key)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          groupActive
                            ? "text-white"
                            : "text-gray-400 hover:text-white hover:bg-gray-800"
                        }`}
                      >
                        <Icon size={16} />
                        <span className="flex-1 text-left">{entry.label}</span>
                        {isOpen ? (
                          <ChevronDown size={13} className="text-gray-500" />
                        ) : (
                          <ChevronRight size={13} className="text-gray-500" />
                        )}
                      </button>

                      {isOpen && (
                        <div className="mt-0.5 ml-4 pl-3 border-l border-gray-700 space-y-0.5">
                          {entry.children.map((child) => {
                            const childActive = isLinkActive(pathname, child.href);
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                onClick={close}
                                className={`block px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                  childActive
                                    ? "text-[#4272EF] font-medium bg-gray-800"
                                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                        