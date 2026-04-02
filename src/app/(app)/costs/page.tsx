import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import CostsClient from "./CostsClient";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const supabase = await createClient();

  const [{ data: projects }, { data: costItems }, { data: stages }] = await Promise.all([
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("cost_items").select("*").order("created_at", { ascending: false }),
    supabase.from("stages").select("id, name, project_id"),
  ]);

  return (
    <>
      <Header title="Cost Tracking" />
      <main className="flex-1 p-6 overflow-auto">
        <CostsClient
          projects={projects ?? []}
          costItems={costItems ?? []}
          stages={stages ?? []}
        />
      </main>
    </>
  );
}
