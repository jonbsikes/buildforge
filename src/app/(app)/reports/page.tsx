import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createClient();

  const [{ data: projects }, { data: costItems }, { data: stages }, { data: sales }] =
    await Promise.all([
      supabase.from("projects").select("*").order("name"),
      supabase.from("cost_items").select("*"),
      supabase.from("stages").select("*"),
      supabase.from("sales").select("*"),
    ]);

  return (
    <>
      <Header title="Reports" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <ReportsClient
          projects={projects ?? []}
          costItems={costItems ?? []}
          stages={stages ?? []}
          sales={sales ?? []}
        />
      </main>
    </>
  