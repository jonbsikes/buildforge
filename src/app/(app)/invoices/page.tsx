import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import InvoicesClient from "./InvoicesClient";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const supabase = await createClient();

  const [{ data: invoices }, { data: projects }, { data: vendors }] = await Promise.all([
    supabase.from("invoices").select("*").order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("vendors").select("id, name").order("name"),
  ]);

  return (
    <>
      <Header title="AP & Invoices" />
      <main className="flex-1 p-6 overflow-auto">
        <InvoicesClient
          invoices={invoices ?? []}
          projects={projects ?? []}
          vendors={vendors ?? []}
        />
      </main>
    </>
  );
}
