import { createClient } from "@/lib/supabase/server";
import NotificationBell from "@/components/layout/NotificationBell";
import AvatarMenu from "@/components/layout/AvatarMenu";

export default async function Header({ title }: { title: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";
  const emailLocal = email.split("@")[0] ?? "";
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
      <div className="flex items-center gap-2">
        <img src="/prairie-sky-logo.png" alt="Prairie Sky Homes" className="h-6 lg:h-8 w-auto" />
        <h1 className="text-lg lg:text-2xl font-bold text-gray-900">{title}</h1>
      </div>
      <div className="flex items-center gap-3 lg:gap-4">
        <NotificationBell />
        <AvatarMenu displayName={displayName} initials={initials} email={email} />
      </div>
    </header>
  );
}
