import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import VendorForm, { type CostCodeOption } from "@/components/vendors/VendorForm";
import VendorDocuments, { type VendorDocument } from "@/components/vendors/VendorDocuments";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditVendorPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [vendorResult, codesResult, docsResult] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, email, phone, address, trade, coi_expiry_date, license_expiry_date, notes, primary_contact_name, primary_contact_email, primary_contact_phone, accounting_contact_name, accounting_contact_email, accounting_contact_phone, ach_bank_name, ach_routing_number, ach_account_number, ach_account_type")
      .eq("id", id)
      .single(),
    supabase
      .from("cost_codes")
      .select("id, code, name, category")
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("documents")
      .select("id, folder, file_name, storage_path, file_size_kb, mime_type, notes, created_at")
      .eq("vendor_id", id)
      .order("created_at", { ascending: false }),
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
          <div className="mt-6">
            <VendorDocuments
              vendorId={id}
              initialDocs={(docsResult.data ?? []) as VendorDocument[]}
            />
          </div>
        </div>
      </main>
    </>
  );
}
