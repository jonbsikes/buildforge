import { createClient } from "@/lib/supabase/server";
import NotificationBell from "@/components/layout/NotificationBell";

export default async function Header({ title }: { title: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="text-sm text-gray-500">{user?.email}</div>
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-medium text-sm">
          {user?.email?.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
