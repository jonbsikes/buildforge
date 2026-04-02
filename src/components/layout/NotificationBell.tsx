"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { Bell, Check, AlertCircle, AlertTriangle, FileText, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Notification {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  reference_id: string | null;
  reference_type: string | null;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  coi_expired: <AlertCircle size={14} className="text-red-500 flex-shrink-0" />,
  license_expired: <AlertCircle size={14} className="text-red-500 flex-shrink-0" />,
  coi_expiring: <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />,
  license_expiring: <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />,
  invoice_past_due: <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />,
  invoice_pending_review: <FileText size={14} className="text-[#4272EF] flex-shrink-0" />,
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  async function fetchNotifications() {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, message, is_read, created_at, reference_id, reference_type")
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Keyboard support: Escape to close, arrow navigation within list
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        // Return focus to the bell button
        const button = ref.current?.querySelector("button");
        button?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }

  async function markAllRead() {
    startTransition(async () => {
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
      if (unreadIds.length === 0) return;
      await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    });
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) fetchNotifications();
        }}
        className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Notifications</p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={isPending}
                  className="text-xs text-[#4272EF] hover:underline disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                aria-label="Close notifications"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No notifications</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                    n.is_read ? "bg-white" : "bg-[#4272EF]/4"
                  }`}
                >
                  <div className="mt-0.5">{TYPE_ICON[n.type] ?? <Bell size={14} className="text-gray-400" />}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed ${n.is_read ? "text-gray-600" : "text-gray-800"}`}>
                      {n.message}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(n.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="p-1 text-gray-300 hover:text-[#4272EF] rounded transition-colors flex-shrink-0"
                      aria-label="Mark as read"
                      title="Mark as read"
                    >
                      <Check size={13} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
