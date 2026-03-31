import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import DrawsClient from "./DrawsClient";

export const dynamic = "force-dynamic";

export default async function DrawsPage() {
  const supabase = await createClient();
  const [{ data: draws }, { data: projects }, { data: contacts }] = await Promise.all([
    supabase
      .from("loan_draws")
      .select("*, contacts(name)")
      .order("draw_date", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
    supabase
      .from("contacts")
      .select("id, name")
      .eq("type", "lender")
      .order("name"),
  ]);

  return (
    <>
      <Header title="Loans & Draws" />
      <main className="flex-1 p-6 overflow-auto">
        <DrawsClient
          draws={draws ?? []}
          projects={projects ?? []}
          lenders={contacts ?? []}
        />
      </main>
    </>
  );
}
