import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import { getUserProfile } from "@/lib/auth";
import ProfileForm from "./ProfileForm";
import { Tags, ChevronRight, User, Building2, Bell, Database } from "lucide-react";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "company", label: "Company", icon: Building2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data & Export", icon: Database },
] as const;

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile();

  return (
    <>
      <Header title="Settings" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl flex flex-col lg:flex-row gap-6 lg:gap-10">
          {/* Side rail (per UI Review § 15 #80) */}
          <nav className="lg:w-48 lg:flex-shrink-0">
            <ul className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar lg:overflow-visible">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-secondary)] transition-colors whitespace-nowrap"
                    >
                      <Icon size={14} />
                      {s.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex-1 space-y-6 min-w-0">
            <section
              id="profile"
              className="bg-white border border-gray-200 rounded-xl p-5 scroll-mt-6"
            >
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900">Profile</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Display name and account info shown across BuildForge.
                </p>
              </div>
              <ProfileForm
                initialDisplayName={profile?.display_name ?? ""}
                email={user.email ?? ""}
                role={profile?.role ?? "project_manager"}
              />
            </section>

            <section
              id="company"
              className="bg-white border border-gray-200 rounded-xl overflow-hidden scroll-mt-6"
            >
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Company</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Master data shared across every project.
                </p>
              </div>
              <Link
                href="/settings/cost-codes"
                className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-[color:var(--neutral-chip-bg)] text-[color:var(--neutral-chip-fg)] flex items-center justify-center">
                  <Tags size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Cost Codes</p>
                  <p className="text-xs text-gray-500">Master list of all 120 cost codes by category.</p>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </Link>
            </section>

            <section
              id="notifications"
              className="bg-white border border-gray-200 rounded-xl p-5 scroll-mt-6"
            >
              <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
              <p className="text-sm text-gray-500 mt-1">
                Notifications fire automatically for invoice past-due, COI/license expiry, and pending review. In-app only — see the bell in the top bar.
              </p>
              <Link
                href="/notifications"
                className="inline-flex items-center mt-3 text-sm font-medium text-[#4272EF] hover:underline"
              >
                Open notifications →
              </Link>
            </section>

            <section
              id="data"
              className="bg-white border border-gray-200 rounded-xl p-5 scroll-mt-6"
            >
              <h2 className="text-base font-semibold text-gray-900">Data &amp; Export</h2>
              <p className="text-sm text-gray-500 mt-1">
                Export the full ledger, GL, and AP for tax season from the Tax Package Export report.
              </p>
              <Link
                href="/financial/tax-export"
                className="inline-flex items-center mt-3 text-sm font-medium text-[#4272EF] hover:underline"
              >
                Tax Package Export →
              </Link>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
