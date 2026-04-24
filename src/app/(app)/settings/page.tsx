import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import { getUserProfile } from "@/lib/auth";
import ProfileForm from "./ProfileForm";
import { Tags, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

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
        <div className="max-w-2xl space-y-6">
          <section className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-gray-900">My Profile</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                This is the name shown across BuildForge.
              </p>
            </div>
            <ProfileForm
              initialDisplayName={profile?.display_name ?? ""}
              email={user.email ?? ""}
              role={profile?.role ?? "project_manager"}
            />
          </section>

          <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Company Settings</h2>
            </div>
            <Link
              href="/settings/cost-codes"
              className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <Tags size={16} className="text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Cost Codes</p>
                <p className="text-xs text-gray-500">Manage the master list of cost codes.</p>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}
