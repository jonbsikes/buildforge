import { createClient } from "@/lib/supabase/server";
import NotificationBell from "@/components/layout/NotificationBell";

export default async function Header({ title }: { title: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const emailLocal = user?.email?.split("@")[0] ?? "";
  const displayName =
    emailLocal
      .split(/[._]/)
      .filter((p) => p.length > 1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .slice(0, 2)
      .join(" ") || emailLocal;

  const initials = displayName
    .split(" ")
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <header
      data-header
      className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4 flex items-center justify-between"
    >
      <h1 className="text-lg lg:text-2xl font-bold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3 lg:gap-4">
        <NotificationBell />
        <div className="flex items-center gap-2 pl-3 lg:pl-4 border-l border-gray-200">
          <span className="text-sm text-gray-600 font-medium hidden sm:block">
            {displayName}
          </span>
          <div
            className="w-8 h-8 lg:w-9 lg:h-9 rounded-full flex items-center justify-center text-white font-medium text-sm"
            style={{ backgroundColor: "#4272EF" }}
          >
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
