import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import LoanForm from "@/components/banking/LoanForm";

export const dynamic = "force-dynamic";

export default async function NewLoanPage() {
  const supabase = await createClient();

  const [projectsResult, lendersResult] = await Promise.all([
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("contacts").select("id, name").eq("type", "lender").order("name"),
  ]);

  return (
    <>
      <Header title="New Loan" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/banking/loans"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors mb-5 block"
          >
            ← Loans
          </Link>
          <LoanForm
            projects={projectsResult.data ?? []}
            lenders={lendersResult.data ?? []}
          />
        </div>
      </main>
    </>
  );
}
