import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import DocumentsClient from "./DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const [{ data: documents }, { data: projects }, { data: vendors }] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name, project_type, subdivision").order("name"),
    supabase.from("vendors").select("id, name, trade").order("name"),
  ]);

  return (
    <>
      <Header title="Documents" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <DocumentsClient
          documents={documents ?? []}
          projects={projects ?? []}
          vendors={vendors ?? []}
        />
      </main>
    </>
  );
}
