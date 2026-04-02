import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { getDrawableInvoices } from "@/app/actions/draws";
import NewDrawForm from "@/components/draws/NewDrawForm";

export const dynamic = "force-dynamic";

export type LenderOption = {
  id: string;
  name: string;
};

export type LoanForDraw = {
  id: string;
  loan_number: string;
  loan_amount: number;
  loan_type: string;
  credit_limit: number | null;
  current_balance: number | null;
  project_id: string;
  lender_id: string;
};

export default async function NewDrawPage() {
  const supabase = await createClient();

  const [eligibleResult, loansResult, lendersResult] = await Promise.all([
    getDrawableInvoices(),
    supabase
      .from("loans")
      .select("id, loan_number, loan_amount, loan_type, credit_limit, current_balance, project_id, lender_id, status")
      .eq("status", "active")
      .order("loan_number"),
    supabase
      .from("contacts")
      .select("id, name")
      .eq("type", "lender")
      .order("name"),
  ]);

  const invoices = eligibleResult.invoices ?? [];
  const allLoans: LoanForDraw[] = (loansResult.data ?? []).map((l) => ({
    id: l.id,
    loan_number: l.loan_number,
    loan_amount: l.loan_amount,
    loan_type: l.loan_type ?? "term_loan",
    credit_limit: l.credit_limit ?? null,
    current_balance: l.current_balance ?? null,
    project_id: l.project_id,
    lender_id: l.lender_id,
  }));

  // Only show lenders that have at least one active loan with eligible invoices
  const projectIdsWithInvoices = new Set(invoices.map((inv) => inv.project?.id).filter(Boolean) as string[]);
  const lenderIdsWithEligibleLoans = new Set(
    allLoans.filter((l) => projectIdsWithInvoices.has(l.project_id)).map((l) => l.lender_id)
  );
  const lenders: LenderOption[] = (lendersResult.data ?? []).filter((l) =>
    lenderIdsWithEligibleLoans.has(l.id)
  );

  return (
    <>
      <Header title="New Draw Request" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/draws"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors mb-5 block"
          >
            ← Draw Requests
          </Link>

          {invoices.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center">
              <p className="text-sm font-medium text-gray-600 mb-1">No invoices ready for draw</p>
              <p className="text-sm text-gray-400">
                Approve invoices and mark them as "pending draw" on the{" "}
                <Link href="/invoices" className="text-[#4272EF] hover:underline">
                  Accounts Payable
                </Link>{" "}
                page.
              </p>
            </div>
          ) : (
            <NewDrawForm invoices={invoices} loans={allLoans} lenders={lenders} />
          )}
        </div>
      </main>
    </>
  );
}
