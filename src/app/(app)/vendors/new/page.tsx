import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import VendorForm, { type CostCodeOption } from "@/components/vendors/VendorForm";

export const dynamic = "force-dynamic";

export default async function NewVendorPage() {
  const supabase = await createClient();

  const { data: codes } = await supabase
    .from("cost_codes")
    .select("id, code, name, category")
    .eq("is_active", true)
    .order("code");

  const costCodes: CostCodeOption[] = (codes ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    category: c.category,
  }));

  return (
    <>
      <Header title="Add Vendor" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/vendors"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors mb-5 block"
          >
            ← Vendors
          </Link>
          <VendorForm costCodes={costCodes} />
        </div>
      </main>
    </>
  );
}
