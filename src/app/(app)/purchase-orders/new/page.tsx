import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import NewPOForm from "./NewPOForm";

export const dynamic = "force-dynamic";

export default async function NewPOPage() {
  const supabase = await createClient();

  const [projectsRes, vendorsRes, codesRes, lastPORes] = await Promise.all([
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("vendors").select("id, name").order("name"),
    supabase.from("cost_codes").select("code, category, description").order("code"),
    supabase.from("purchase_orders").select("po_number").order("created_at", { ascending: false }).limit(1),
  ]);

  // Generate next PO number
  const lastPO = lastPORes.data?.[0]?.po_number ?? "PO-0000";
  const match = lastPO.match(/(\d+)$/);
  const nextNum = match ? (parseInt(match[1]) + 1).toString().padStart(4, "0") : "0001";
  const nextPONumber = `PO-${nextNum}`;

  return (
    <>
      <Header title="New Purchase Order" />
      <NewPOForm
        projects={(projectsRes.data ?? []) as Parameters<typeof NewPOForm>[0]["projects"]}
        vendors={(vendorsRes.data ?? []) as Parameters<typeof NewPOForm>[0]["vendors"]}
        costCodes={(codesRes.data ?? []) as Parameters<typeof NewPOForm>[0]["costCodes"]}
        nextPONumber={nextPONumber}
      />
    </>
  );
}
