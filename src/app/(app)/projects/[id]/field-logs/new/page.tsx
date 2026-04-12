import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import NewFieldLogForm from "./NewFieldLogForm";

export default async function NewFieldLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const projectRes = await supabase.from("projects").select("id, name").eq("id", id).single();
  if (!projectRes.data) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  return (
    <>
      <Header title="New Field Log" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <Link href={`/projects/${id}/field-logs`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
            <ArrowLeft size={15} /> Field Logs
          </Link>
          <NewFieldLogForm projectId={id} userId={user.id} />
        </div>
  