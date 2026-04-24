import { Home, Building2, DollarSign, Layers } from "lucide-react";

export interface SubNavItem {
  label: string;
  href: string;
}

export interface NavSection {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  href: string;
  matchPaths: string[];
  subNav: SubNavItem[];
}

export const navSections: NavSection[] = [
  {
    key: "home",
    label: "Home",
    icon: Home,
    href: "/dashboard",
    matchPaths: ["/dashboard"],
    subNav: [
      { label: "Overview", href: "/dashboard" },
      { label: "Notifications", href: "/notifications" },
      { label: "To-dos", href: "/todos" },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    icon: Building2,
    href: "/projects",
    matchPaths: ["/projects", "/reports", "/todos", "/field-logs"],
    subNav: [
      { label: "Projects hub", href: "/projects" },
      { label: "All projects", href: "/projects/tree" },
      { label: "Reports", href: "/reports" },
      { label: "Field logs", href: "/field-logs" },
      { label: "To-dos", href: "/todos" },
    ],
  },
  {
    key: "financial",
    label: "Financial",
    icon: DollarSign,
    href: "/financial",
    matchPaths: ["/financial", "/invoices", "/banking", "/draws", "/loans"],
    subNav: [
      { label: "Summary", href: "/financial" },
      { label: "Balance sheet", href: "/financial/balance-sheet" },
      { label: "Accounts payable", href: "/invoices" },
      { label: "Payment register", href: "/banking/payments" },
      { label: "Banking", href: "/banking/accounts" },
      { label: "Loans", href: "/banking/loans" },
      { label: "Draws", href: "/draws" },
    ],
  },
  {
    key: "manage",
    label: "Manage",
    icon: Layers,
    href: "/manage",
    matchPaths: ["/manage", "/vendors", "/contacts", "/documents", "/settings"],
    subNav: [
      { label: "Vendors", href: "/vendors" },
      { label: "Contacts", href: "/contacts" },
      { label: "Documents", href: "/documents" },
      { label: "Cost Codes", href: "/settings/cost-codes" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

export function sectionFor(pathname: string): NavSection | null {
  for (const s of navSections) {
    if (s.key === "home") {
      if (pathname === "/dashboard") return s;
      continue;
    }
    if (s.matchPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return s;
    }
  }
  return null;
}
