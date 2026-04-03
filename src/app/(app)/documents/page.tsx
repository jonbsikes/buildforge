import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import DocumentsClient from "./DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const [{ data: documents }, { data: projects }] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
  ]);

  return (
    <>
      <Header title="Documents" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <DocumentsClient documents={documents ?? []} projects={projects ?? []} />
      </main>
    </>
  );
}
