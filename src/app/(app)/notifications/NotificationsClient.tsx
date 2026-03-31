"use client";

import { useTransition } from "react";
import { Bell, CheckCheck, AlertCircle, Clock, Shield } from "lucide-react";
import { markRead, markAllRead } from "./actions";
import type { Database } from "@/types/database";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  invoice_past_due: <Clock size={16} className="text-red-500" />,
  invoice_pending_review: <AlertCircle size={16} className="text-amber-500" />,
  coi_expiring: <Shield size={16} className="text-amber-500" />,
  coi_expired: <Shield size={16} className="text-red-500" />,
  license_expiring: <Shield size={16} className="text-amber-500" />,
  license_expired: <Shield size={16} className="text-red-500" />,
};

const TYPE_COLORS: Record<string, string> = {
  invoice_past_due: "border-l-red-400",
  invoice_pending_review: "border-l-amber-400",
  coi_expiring: "border-l-amber-400",
  coi_expired: "border-l-red-400",
  license_expiring: "border-l-amber-400",
  license_expired: "border-l-red-400",
};

function fmtDate(str: string) {
  return new Date(str).toLocaleDateString("en-AU", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function NotificationsClient({ notifications }: { notifications: Notification[] }) {
  const [, startTransition] = useTransition();
  const unread = notifications.filter((n) => !n.is_read);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {unread.length > 0 ? (
            <span className="font-medium text-gray-900">{unread.length} unread</span>
          ) : (
            "All caught up!"
          )}
        </p>
        {unread.length > 0 && (
          <button
            onClick={() => startTransition(() => markAllRead())}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <CheckCheck size={15} /> Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-16 text-center">
          <Bell size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`bg-white rounded-xl border border-gray-200 border-l-4 px-4 py-3 flex items-start gap-3 transition-opacity ${
                n.is_read ? "opacity-60" : ""
              } ${TYPE_COLORS[n.type] ?? "border-l-gray-300"}`}
            >
              <div className="mt-0.5 shrink-0">
                {TYPE_ICONS[n.type] ?? <Bell size={16} className="text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.is_read ? "text-gray-500" : "text-gray-900 font-medium"}`}>
                  {n.message}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDate(n.created_at)}</p>
              </div>
              {!n.is_read && (
                <button
                  onClick={() => startTransition(() => markRead(n.id))}
                  className="shrink-0 text-xs text-gray-400 hover:text-gray-600"
                >
                  <CheckCheck size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
