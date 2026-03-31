import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function Header({ title }: { title: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false);

  const initials = user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-4">
        <Link href="/notifications" className="relative text-gray-500 hover:text-gray-700 transition-colors">
          <Bell size={20} />
          {(unreadCount ?? 0) > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1"
              style={{ backgroundColor: "#4272EF" }}
            >
              {unreadCount! > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 hidden sm:block">{user?.email}</span>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm"
            style={{ backgroundColor: "#4272EF" }}
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
