import Header from "@/components/layout/Header";
import { createClient } from "@/lib/supabase/server";
import CostCodesClient from "./CostCodesClient";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type CostCode = Database["public"]["Tables"]["cost_codes"]["Row"];

export default async function CostCodesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("cost_codes").select("*").order("code");
  const costCodes = (data ?? []) as CostCode[];

  return (
    <>
      <Header title="Cost Codes" />
      <CostCodesClient costCodes={costCodes} />
    </>
  );
}
