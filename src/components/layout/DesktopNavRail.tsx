"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Building2,
  DollarSign,
  Layers,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type RailSection = {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  href: string;
  matchPaths: string[];
};

const sections: RailSection[] = [
  {
    key: "home",
    label: "Home",
    icon: Home,
    href: "/dashboard",
    matchPaths: ["/dashboard"],
  },
  {
    key: "projects",
    label: "Projects",
    icon: Building2,
    href: "/projects/hub",
    matchPaths: ["/projects", "/reports", "/todos", "/field-logs"],
  },
  {
    key: "financial",
    label: "Financial",
    icon: DollarSign,
    href: "/financial",
    matchPaths: ["/financial", "/invoices", "/banking", "/draws", "/loans"],
  },
  {
    key: "manage",
    label: "Manage",
    icon: Layers,
    href: "/manage",
    matchPaths: ["/manage", "/vendors", "/contacts", "/documents", "/settings"],
  },
];

function isActive(pathname: string, section: RailSection): boolean {
  if (section.key === "home") return pathname === "/dashboard";
  return section.matchPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export default function DesktopNavRail() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="hidden lg:flex h-screen relative z-30">
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
    </div>
  );
}
