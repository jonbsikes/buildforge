import { createClient } from "@/lib/supabase/server";
import { Menu } from "lucide-react";

interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
}

export default async function Header({ title }: { title: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const initial = user?.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Hamburger — rendered by layout via MobileMenuButton, but we keep a placeholder slot */}
        <div id="mobile-menu-slot" className="lg:hidden" />
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-sm text-gray-500">{user?.email}</div>
        <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-semibold text-sm select-none">
          {initial}
        </div>
      </div>
    </header>
  );
}
