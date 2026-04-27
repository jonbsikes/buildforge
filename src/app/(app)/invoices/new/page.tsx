import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import InvoiceForm from "@/components/invoices/InvoiceForm";


export default async function NewInvoicePage() {
  const supabase = await createClient();

  const [vendorsResult, projectsResult, costCodesResult] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("projects")
      .select("id, name, project_type, address, subdivision, block, lot")
      .in("status", ["planning", "active"])
      .order("name"),
    supabase
      .from("cost_codes")
      .select("id, code, name, project_type")
      .is("user_id", null)
      .order("code"),
  ]);

  // Sort cost codes numerically
  const costCodes = (costCodesResult.data ?? []).sort(
    (a, b) => parseInt(a.code, 10) - parseInt(b.code, 10)
  );

  return (
    <>
      <Header title="New Invoice" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-3xl mx-auto mb-5">
          <Link
            href="/invoices"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to Accounts Payable
          </Link>
        </div>
        <InvoiceForm
          vendors={vendorsResult.data ?? []}
          projects={(projectsResult.data ?? []) as { id: string; name: string; project_type: "home_construction" | "land_development"; address?: string | null; subdivision?: string | null; block?: string | null; lot?: string | null }[]}
          costCodes={costCodes}
        />
      </main>
    </>
  );
}
