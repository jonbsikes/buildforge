import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import AddTodoForm from "./AddTodoForm";

export default async function AddTodoPage({
  params,
}: {
  params: Promise<{ id: string; logId: string }>;
}) {
  const { id, logId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const logRes = await supabase.from("field_logs").select("id, log_date").eq("id", logId).single();
  if (!logRes.data) notFound();

  return (
    <>
      <Header title="Add To-Do" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-lg mx-auto">
          <Link
            href={`/projects/${id}/field-logs/${logId}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5"
          >
            <ArrowLeft size={15} /> Back to Log
          </Link>
          <AddTodoForm projectId={id} logId={logId} userId={user.id} />
        </div>
      </main>
    </>
  );
}
