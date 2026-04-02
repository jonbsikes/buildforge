import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import HomeConstructionForm from "@/components/projects/HomeConstructionForm";

export const dynamic = "force-dynamic";

export default async function NewHomeConstructionPage() {
  const supabase = await createClient();

  const [lendersResult, costCodesResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, name")
      .eq("type", "lender")
      .order("name"),
    supabase
      .from("cost_codes")
      .select("id, code, name")
      .is("user_id", null)
      .order("code"),
  ]);

  const allCodes = (costCodesResult.data ?? []);
  // Home construction codes: 34–102
  const costCodes = allCodes
    .filter((c) => {
      const n = parseInt(c.code, 10);
      return n >= 34 && n <= 102;
    })
    .sort((a, b) => parseInt(a.code, 10) - parseInt(b.code, 10));

  return (
    <>
      <Header title="New Home Construction Project" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto mb-6">
          <Link
            href="/projects/new"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back
          </Link>
        </div>
        <HomeConstructionForm
          lenders={lendersResult.data ?? []}
          costCodes={costCodes}
        />
      </main>
    </>
  );
}
