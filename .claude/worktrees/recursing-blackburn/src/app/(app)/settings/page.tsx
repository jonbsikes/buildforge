import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: costCodes } = await supabase
    .from("cost_codes")
    .select("*")
    .order("code");

  return (
    <>
      <Header title="Settings" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <SettingsClient costCodes={costCodes ?? []} />
      </main>
    </>
  );
}
