import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import LoanForm from "@/components/banking/LoanForm";
import DeleteLoanButton from "@/components/banking/DeleteLoanButton";


interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditLoanPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [loanResult, projectsResult, lendersResult] = await Promise.all([
    supabase
      .from("loans")
      .select("id, project_id, lender_id, loan_number, loan_amount, loan_type, credit_limit, current_balance, interest_rate, origination_date, maturity_date, status, notes")
      .eq("id", id)
      .single(),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("contacts").select("id, name").eq("type", "lender").order("name"),
  ]);

  if (!loanResult.data) notFound();
  const loan = loanResult.data;

  return (
    <>
      <Header title={`Edit Loan #${loan.loan_number}`} />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <Link
              href="/banking/loans"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Loans
            </Link>
            <DeleteLoanButton
              loanId={loan.id}
              loanNumber={loan.loan_number}
              redirectAfter="/banking/loans"
            />
          </div>
          <LoanForm
            projects={projectsResult.data ?? []}
            lenders={lendersResult.data ?? []}
            initial={{
              id: loan.id,
              project_id: loan.project_id,
              lender_id: loan.lender_id,
              loan_number: loan.loan_number,
              loan_amount: String(loan.loan_amount),
              loan_type: loan.loan_type ?? "term_loan",
              credit_limit: loan.credit_limit != null ? String(loan.credit_limit) : "",
              current_balance: loan.current_balance != null ? String(loan.current_balance) : "",
              interest_rate: loan.interest_rate != null ? String(loan.interest_rate) : "",
              origination_date: loan.origination_date ?? "",
              maturity_date: loan.maturity_date ?? "",
              status: loan.status,
              notes: loan.notes ?? "",
            }}
          />
        </div>
      </main>
    </>
  );
}
