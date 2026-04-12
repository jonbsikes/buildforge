import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import NewLoanForm from "./NewLoanForm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewLoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, contactsRes] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).single(),
    supabase.from("contacts").select("id, name").in("type", ["lender"]).order("name"),
  ]);

  if (!projectRes.data) notFound();

  return (
    <>
      <Header title="Add Loan" />
      <NewLoanForm
        projectId={id}
        contacts={(contactsRes.data ?? []) as Parameters<typeof NewLoanForm>[0]["contacts"]}
