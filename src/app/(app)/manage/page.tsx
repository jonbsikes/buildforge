import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import {
  Users,
  Contact,
  FolderOpen,
  Settings,
  ChevronRight,
  AlertTriangle,
  Shield,
  Bell,
} from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";

export const dynamic = "force-dynamic";

function daysUntil(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

export default async function ManageHubPage() {
  const supabase = await createClient();

  const [
    { data: vendors },
    { data: contacts },
    { data: documents },
    { data: notifications },
  ] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, trade, coi_expiry_date, license_expiry_date")
      .order("name", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, name, type")
      .order("name", { ascending: true }),
    supabase
      .from("documents")
      .select("id, file_name, folder, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id, is_read")
      .eq("is_read", false),
  ]);

  const allVendors = vendors ?? [];
  const vendorCount = allVendors.length;
  const expiringVendors = allVendors.filter((v) => {
    const c = daysUntil(v.coi_expiry_date);
    const l = daysUntil(v.license_expiry_date);
    return (c !== null && c <= 30) || (l !== null && l <= 30);
  });
  const expiredVendors = allVendors.filter((v) => {
    const c = daysUntil(v.coi_expiry_date);
    const l = daysUntil(v.license_expiry_date);
    return (c !== null && c <= 0) || (l !== null && l <= 0);
  });

  const contactCount = (contacts ?? []).length;
  const docCount = (documents ?? []).length;
  const unreadNotifications = (notifications ?? []).length;

  const navCards = [
    {
      href: "/vendors",
      icon: Users,
      label: "Vendors",
      description: expiringVendors.length > 0
        ? `${vendorCount} vendors, ${expiringVendors.length} expiring`
        : `${vendorCount} vendor${vendorCount !== 1 ? "s" : ""}`,
      color: "text-[#4272EF]",
      bg: "bg-blue-50",
      badge: expiredVendors.length > 0 ? `${expiredVendors.length}` : null,
    },
    {
      href: "/contacts",
      icon: Contact,
      label: "Contacts",
      description: `${contactCount} contact${contactCount !== 1 ? "s" : ""}`,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      badge: null,
    },
    {
      href: "/documents",
      icon: FolderOpen,
      label: "Documents",
      description: `${docCount} recent document${docCount !== 1 ? "s" : ""}`,
      color: "text-purple-600",
      bg: "bg-purple-50",
      badge: null,
    },
  ];

  const utilityCards = [
    { href: "/notifications", icon: Bell, label: "Notifications", description: unreadNotifications > 0 ? `${unreadNotifications} unread` : "All caught up", color: "text-amber-600", bg: "bg-amber-50" },
    { href: "/settings", icon: Settings, label: "Settings", description: "Company & cost codes", color: "text-gray-600", bg: "bg-gray-100" },
  ];

  return (
    <>
      <Header title="Manage" />
      <main className="flex-1 p-4 lg:p-8 overflow-auto">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users size={18} className="text-[#4272EF]" />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 tabular-nums">{vendorCount}</p>
            <p className="text-xs lg:text-sm text-gray-500">Vendors</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Contact size={18} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 tabular-nums">{contactCount}</p>
            <p className="text-xs lg:text-sm text-gray-500">Contacts</p>
          </div>
          <div className={`bg-white border rounded-xl p-4 lg:p-5 shadow-sm ${expiringVendors.length > 0 ? "border-amber-200" : "border-gray-200"}`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center ${expiringVendors.length > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
                <Shield size={18} className={expiringVendors.length > 0 ? "text-amber-600" : "text-gray-400"} />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 tabular-nums">{expiringVendors.length}</p>
            <p className="text-xs lg:text-sm text-gray-500">COI/License Expiring</p>
            {expiredVendors.length > 0 && <p className="text-xs text-red-500 font-medium mt-0.5">{expiredVendors.length} already expired</p>}
          </div>
          <div className={`bg-white border rounded-xl p-4 lg:p-5 shadow-sm ${unreadNotifications > 0 ? "border-amber-200" : "border-gray-200"}`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center ${unreadNotifications > 0 ? "bg-amber-50" : "bg-gray-50"}`}>
                <Bell size={18} className={unreadNotifications > 0 ? "text-amber-600" : "text-gray-400"} />
              </div>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 tabular-nums">{unreadNotifications}</p>
            <p className="text-xs lg:text-sm text-gray-500">Unread Notifications</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Nav Cards */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Navigate</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {navCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all group relative"
                    >
                      <div className="flex items-start justify-between">
                        <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                          <Icon size={20} className={card.color} />
                        </div>
                        {card.badge && (
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "var(--tint-over)", color: "var(--status-over)" }}
                          >
                            {card.badge}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 mb-0.5 group-hover:text-[#4272EF] transition-colors">{card.label}</p>
                      <p className="text-xs text-gray-500">{card.description}</p>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Utilities */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Utilities</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {utilityCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.href}
                      href={card.href}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all group"
                    >
                      <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                        <Icon size={20} className={card.color} />
                      </div>
                      <p className="font-semibold text-gray-900 mb-0.5 group-hover:text-[#4272EF] transition-colors">{card.label}</p>
                      <p className="text-xs text-gray-500">{card.description}</p>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Vendor Alerts */}
          <div className="space-y-4">
            {expiringVendors.length > 0 && (
              <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <h2 className="font-bold text-gray-900">Expiring Soon</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {expiringVendors.slice(0, 8).map((v) => {
                    const coiDays = daysUntil(v.coi_expiry_date);
                    const licDays = daysUntil(v.license_expiry_date);
                    const isExpired = (coiDays !== null && coiDays <= 0) || (licDays !== null && licDays <= 0);
                    return (
                      <Link
                        key={v.id}
                        href={`/vendors/${v.id}`}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: isExpired ? "var(--status-over)" : "var(--status-warning)" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{v.name}</p>
                          <p className="text-xs text-gray-400">{v.trade ?? "No trade"}</p>
                        </div>
                        <StatusBadge status={isExpired ? "over" : "warning"} size="sm">
                          {isExpired ? "Expired" : `${Math.min(coiDays ?? 999, licDays ?? 999)}d`}
                        </StatusBadge>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Documents */}
            {(documents ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Recent Documents</h2>
                  <Link href="/documents" className="text-sm font-medium text-[#4272EF]">View all</Link>
                </div>
                <div className="divide-y divide-gray-50">
                  {(documents ?? []).map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                      <FolderOpen size={14} className="text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{doc.file_name}</p>
                        <p className="text-xs text-gray-400">{doc.folder}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
