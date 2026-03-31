"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  DollarSign,
  FileText,
  BarChart2,
  Settings,
  HardHat,
  Truck,
  CreditCard,
  Layers,
  ClipboardList,
  BookOpen,
  Users,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/projects", label: "Projects", icon: FolderOpen },
    ],
  },
  {
    label: "Financials",
    items: [
      { href: "/costs", label: "Cost Tracking", icon: DollarSign },
      { href: "/invoices", label: "AP & Invoices", icon: FileText },
      { href: "/draws", label: "Loans & Draws", icon: CreditCard },
    ],
  },
  {
    label: "Field",
    items: [
      { href: "/field-logs", label: "Field Logs", icon: ClipboardList },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/vendors", label: "Vendors", icon: Truck },
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/documents", label: "Documents", icon: BookOpen },
    ],
  },
  {
    label: "Reporting",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart2 },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 bg-gray-900 min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#4272EF" }}>
            <HardHat size={16} className="text-white" />
          </div>
          <span className="text-white font-bold text-lg">BuildForge</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "text-white"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                    }`}
                    style={active ? { backgroundColor: "#4272EF" } : undefined}
                  >
                    <Icon size={17} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
