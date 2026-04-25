"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCheck, AlertCircle, Clock, Shield } from "lucide-react";
import { markRead, markAllRead } from "@/app/actions/notifications";
import EmptyState from "@/components/ui/EmptyState";
import FilterChipRail, { type FilterChip } from "@/components/ui/FilterChipRail";
import DateValue from "@/components/ui/DateValue";
import type { Database } from "@/types/database";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  invoice_past_due: <Clock size={14} />,
  invoice_pending_review: <AlertCircle size={14} />,
  coi_expiring: <Shield size={14} />,
  coi_expired: <Shield size={14} />,
  license_expiring: <Shield size={14} />,
  license_expired: <Shield size={14} />,
};

const TYPE_TONE: Record<string, "over" | "warning" | "neutral"> = {
  invoice_past_due: "over",
  invoice_pending_review: "warning",
  coi_expiring: "warning",
  coi_expired: "over",
  license_expiring: "warning",
  license_expired: "over",
};

const TONE_COLOR = {
  over: "var(--status-over)",
  warning: "var(--status-warning)",
  neutral: "var(--status-neutral)",
};

type FilterId = "all" | "past_due" | "compliance" | "invoices" | "unread";

function notificationCategory(type: string): "past_due" | "compliance" | "invoices" | "other" {
  if (type === "invoice_past_due") return "past_due";
  if (type.startsWith("coi_") || type.startsWith("license_")) return "compliance";
  if (type.startsWith("invoice_")) return "invoices";
  return "other";
}

function dayBucket(iso: string): "today" | "yesterday" | "week" | "older" {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff < 1 && d.getDate() === now.getDate()) return "today";
  if (diff < 2) return "yesterday";
  if (diff < 7) return "week";
  return "older";
}

function refHref(n: Notification): string | null {
  if (n.reference_type === "invoice" && n.reference_id) return `/invoices/${n.reference_id}`;
  if (n.reference_type === "vendor" && n.reference_id) return `/vendors/${n.reference_id}`;
  return null;
}

export default function NotificationsClient({ notifications }: { notifications: Notification[] }) {
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<FilterId>("all");

  const counts = useMemo(() => {
    const map = { all: notifications.length, past_due: 0, compliance: 0, invoices: 0, unread: 0 };
    for (const n of notifications) {
      const cat = notificationCategory(n.type);
      if (cat === "past_due") map.past_due += 1;
      if (cat === "compliance") map.compliance += 1;
      if (cat === "invoices") map.invoices += 1;
      if (!n.is_read) map.unread += 1;
    }
    return map;
  }, [notifications]);

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "all") return true;
      if (filter === "unread") return !n.is_read;
      const cat = notificationCategory(n.type);
      return cat === filter;
    });
  }, [notifications, filter]);

  const grouped = useMemo(() => {
    const map: Record<"today" | "yesterday" | "week" | "older", Notification[]> = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };
    for (const n of filtered) map[dayBucket(n.created_at)].push(n);
    return map;
  }, [filtered]);

  const groupOrder: Array<{ id: "today" | "yesterday" | "week" | "older"; label: string }> = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "week", label: "This week" },
    { id: "older", label: "Older" },
  ];

  const chips: FilterChip<FilterId>[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "unread", label: "Unread", count: counts.unread, tone: counts.unread > 0 ? "warning" : "neutral" },
    { id: "past_due", label: "Past due", count: counts.past_due, tone: counts.past_due > 0 ? "over" : "neutral" },
    { id: "compliance", label: "COI / License", count: counts.compliance, tone: counts.compliance > 0 ? "warning" : "neutral" },
    { id: "invoices", label: "Invoices", count: counts.invoices },
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          {counts.unread > 0 ? (
            <span className="font-medium text-gray-900">{counts.unread} unread</span>
          ) : (
            "All caught up!"
          )}
        </p>
        {counts.unread > 0 && (
          <button
            onClick={() => startTransition(() => markAllRead())}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <CheckCheck size={15} /> Mark all read
          </button>
        )}
      </div>

      <FilterChipRail<FilterId> chips={chips} active={filter} onChange={setFilter} />

      {notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState
            icon={<Bell size={20} />}
            title="No notifications yet"
            description="You'll see alerts here when invoices go past due, COIs or licenses approach expiry, or invoices need review."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groupOrder.map(({ id, label }) => {
            const items = grouped[id];
            if (items.length === 0) return null;
            return (
              <section key={id}>
                <h2 className="text-[10px] uppercase tracking-[0.08em] font-semibold text-gray-400 mb-2">
                  {label}
                </h2>
                <ul className="space-y-2">
                  {items.map((n) => {
                    const tone = TYPE_TONE[n.type] ?? "neutral";
                    const href = refHref(n);
                    const inner = (
                      <div className="flex items-start gap-3">
                        <div
                          className="mt-0.5 shrink-0"
                          style={{ color: TONE_COLOR[tone] }}
                        >
                          {TYPE_ICONS[n.type] ?? <Bell size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${n.is_read ? "text-gray-500" : "text-gray-900 font-medium"}`}>
                            {n.message}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            <DateValue value={n.created_at} kind="smart" className="text-gray-400" />
                          </p>
                        </div>
                        {!n.is_read && (
                          <span
                            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                            style={{ backgroundColor: "var(--brand-blue)" }}
                            aria-label="Unread"
                          />
                        )}
                      </div>
                    );
                    return (
                      <li key={n.id}>
                        {href ? (
                          <Link
                            href={href}
                            onClick={() => {
                              if (!n.is_read) startTransition(() => markRead(n.id));
                            }}
                            className={`block bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition-colors ${
                              n.is_read ? "opacity-70" : ""
                            }`}
                          >
                            {inner}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!n.is_read) startTransition(() => markRead(n.id));
                            }}
                            className={`block w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-gray-400 transition-colors ${
                              n.is_read ? "opacity-70" : ""
                            }`}
                          >
                            {inner}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
