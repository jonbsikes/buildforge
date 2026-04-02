import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import VendorForm, { type CostCodeOption } from "@/components/vendors/VendorForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditVendorPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [vendorResult, codesResult] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, email, phone, address, trade, coi_expiry_date, license_expiry_date, notes")
      .eq("id", id)
      .single(),
    supabase
      .from("cost_codes")
      .select("id, code, name, category")
      .eq("is_active", true)
      .order("code"),
  ]);

  if (!vendorResult.data) notFound();

  const vendor = vendorResult.data;
  const costCodes: CostCodeOption[] = (codesResult.data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    category: c.category,
  }));

  return (
    <>
      <Header title={`Edit: ${vendor.name}`} />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/vendors"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors mb-5 block"
          >
            ← Vendors
          </Link>
          <VendorForm costCodes={costCodes} initialData={vendor} />
        </div>
      </main>
    </>
  