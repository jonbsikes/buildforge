import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import VendorsClient from "./VendorsClient";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .order("name");

  return (
    <>
      <Header title="Vendors" />
      <main className="flex-1 p-6 overflow-auto">
        <VendorsClient vendors={vendors ?? []} />
      </main>
    </>
  );
}
