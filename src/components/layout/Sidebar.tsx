"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  BarChart2,
  Settings,
  HardHat,
  Users,
  BookUser,
  ClipboardList,
  Landmark,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/invoices", label: "Accounts Payable", icon: FileText },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/vendors", label: "Vendors", icon: Users },
  { href: "/contacts", label: "Contacts", icon: BookUser },
  { href: "/loans", label: "Loans", icon: Landmark },
  { href: "/reports", label: "Reports", icon: BarChart2 },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const sidebarContent = (
    <aside className="w-64 bg-gray-900 h-full flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <HardHat className="text-amber-400" size={22} />
          <span className="text-white font-bold text-lg tracking-tight">BuildForge</span>
        </div>
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="lg:hidden text-gray-400 hover:text-white transition-colors p-1"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                active
                  ? "bg-gray-800 text-white border-l-2 border-amber-500 pl-[10px]"
                  : "text-gray-400 hover:text-white hover:bg-gray-800 border-l-2 border-transparent pl-[10px]"
              }`}
            >
              <Icon size={16} className={active ? "text-amber-400" : ""} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-gray-800 space-y-0.5">
        <Link
          href="/settings"
          onClick={onClose}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-l-2 ${
            pathname.startsWith("/settings")
              ? "bg-gray-800 text-white border-amber-500 pl-[10px]"
              : "text-gray-400 hover:text-white hover:bg-gray-800 border-transparent pl-[10px]"
          }`}
        >
          <Settings size={16} className={pathname.startsWith("/settings") ? "text-amber-400" : ""} />
          Settings
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 border-l-2 border-transparent text-sm text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:z-50">
        {sidebarContent}
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="relative flex flex-col w-64 h-full shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
