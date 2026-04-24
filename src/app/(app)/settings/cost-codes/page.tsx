import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import CostCodesClient from "./CostCodesClient";

export const dynamic = "force-dynamic";

export default async function CostCodesSettingsPage() {
  const supabase = await createClient();
  const { data: costCodes } = await supabase
    .from("cost_codes")
    .select("*")
    .order("code");

  return (
    <>
      <Header title="Cost Codes" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <CostCodesClient costCodes={costCodes ?? []} />
      </main>
    </>
  );
}
