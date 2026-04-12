import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import VendorForm, { type CostCodeOption } from "@/components/vendors/VendorForm";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ name?: string; returnTo?: string; vendorCardIdx?: string }>;
}

export default async function NewVendorPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { name: prefillName, returnTo, vendorCardIdx } = await searchParams;

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
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <Link
            href={returnTo === "invoice" ? "/invoices/new" : returnTo === "invoice-upload" ? "/invoices/upload" : "/vendors"}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors mb-5 block"
          >
            {returnTo === "invoice" || returnTo === "invoice-upload" ? "← Back to Invoice" : "← Vendors"}
          </Link>
          <VendorF