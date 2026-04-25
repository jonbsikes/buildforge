import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/auth";
import NotificationBell from "@/components/layout/NotificationBell";
import AvatarMenu from "@/components/layout/AvatarMenu";
import HeaderSearchButton from "@/components/layout/HeaderSearchButton";
import { ChevronRight } from "lucide-react";

type Crumb = {
  label: string;
  href?: string;
};

type HeaderProps = {
  /** Page title (used as the rightmost crumb if no breadcrumbs are passed). */
  title: string;
  /**
   * Optional breadcrumb trail. If omitted, the header renders just the title.
   * Last crumb is rendered emphasized as the "where am I" pin.
   * Per UI Review § 02 #13.
   */
  breadcrumbs?: Crumb[];
};

export default async function Header({ title, breadcrumbs }: HeaderProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getUserProfile();

  const email = user?.email ?? "";
  const emailLocal = email.split("@")[0] ?? "";
  const profileName = profile?.display_name?.trim() ?? "";
  const displayName =
    profileName ||
    emailLocal
      .split(/[._]/)
      .filter((p) => p.length > 1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .slice(0, 2)
      .join(" ") ||
    emailLocal;

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  const crumbs: Crumb[] = breadcrumbs ?? [{ label: title }];

  return (
    <header
      data-header
      className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <img src="/prairie-sky-logo.png" alt="Prairie Sky Homes" className="h-6 lg:h-8 w-auto flex-shrink-0" />
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-1.5 min-w-0">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && (
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" aria-hidden />
                  )}
                  {last ? (
                    <span
                      className="text-lg lg:text-2xl font-bold text-gray-900 truncate"
                      aria-current="page"
                    >
                      {c.label}
                    </span>
                  ) : c.href ? (
                    <a
                      href={c.href}
                      className="text-sm text-gray-500 hover:text-gray-900 transition-colors truncate"
                    >
                      {c.label}
                    </a>
                  ) : (
                    <span className="text-sm text-gray-500 truncate">{c.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
      <div className="flex items-center gap-3 lg:gap-4 flex-shrink-0">
        <HeaderSearchButton />
        <NotificationBell />
        <AvatarMenu displayName={displayName} initials={initials} email={email} />
      </div>
    </header>
  );
}
