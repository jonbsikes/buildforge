import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import NewContractForm from "./NewContractForm";
import { notFound } from "next/navigation";

export default async function NewContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, vendorsRes, codesRes] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).single(),
    supabase.from("vendors").select("id, name").order("name"),
    supabase.from("cost_codes").select("code, category, description").order("code"),
  ]);

  if (!projectRes.data) notFound();

  return (
    <>
      <Header title="New Contract" />
      <NewContractForm
        projectId={id}
        projectName={projectRes.data.name}
        vendors={vendorsRes.data ?? []}
        costCodes={codesRes.data ?? []}
      />
    </>
  );
}
