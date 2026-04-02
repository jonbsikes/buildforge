import Header from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import NewMilestoneForm from "./NewMilestoneForm";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Stage = Database["public"]["Tables"]["stages"]["Row"];

export default async function NewMilestonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("stages").select("id, name").eq("project_id", id).order("order_index");
  const stages = (data ?? []) as Pick<Stage, "id" | "name">[];

  return (
    <>
      <Header title="Add Milestone" />
      <NewMilestoneForm stages={stages} />
    </>
  );
}
