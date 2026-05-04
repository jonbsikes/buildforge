import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import VendorCreditForm from "@/components/credits/VendorCreditForm";

interface PageProps {
  searchParams: Promise<{ vendor?: string }>;
}

export default async function NewVendorCreditPage({ searchParams }: PageProps) {
  const { vendor: prefillVendor } = await searchParams;
  const supabase = await createClient();

  const [vendorsResult, projectsResult, costCodesResult] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("projects")
      .select("id, name, project_type")
      .in("status", ["planning", "active"])
      .order("name"),
    supabase
      .from("cost_codes")
      .select("id, code, name, project_type")
      .is("user_id", null)
      .order("code"),
  ]);

  const costCodes = (costCodesResult.data ?? []).sort(
    (a, b) => parseInt(a.code, 10) - parseInt(b.code, 10)
  );

  return (
    <>
      <Header
        title="New Vendor Credit"
        breadcrumbs={[
          { label: "Accounts Payable", href: "/invoices" },
          { label: "Vendor Credits", href: "/invoices/credits" },
          { label: "New" },
        ]}
      />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-3xl mx-auto mb-5">
          <Link
            href="/invoices/credits"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to Vendor Credits
          </Link>
        </div>
        <VendorCreditForm
          vendors={vendorsResult.data ?? []}
          projects={(projectsResult.data ?? []).filter((p) => p.project_type !== "general_admin") as { id: string; name: string; project_type: "home_construction" | "land_development" }[]}
          costCodes={costCodes}
          defaultVendorId={prefillVendor ?? null}
        />
      </main>
    </>
  );
}
