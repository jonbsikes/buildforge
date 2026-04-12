import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import DeleteLoanButton from "@/components/banking/DeleteLoanButton";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";
import AdminOnly from "@/components/ui/AdminOnly";

export const dynamic = "force-dynamic";

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const STATUS_COLORS: Record<string, string> = {
  active:     "bg-green-100 text-green-700",
  paid_off:   "bg-blue-100 text-blue-700",
  in_default: "bg-red-100 text-red-600",
};

export default async function LoansPage() {
  const supabase = await createClient();

  const { data: loansData } = await supabase
    .from("loans")
    .select(`
      id, loan_number, loan_amount, loan_type, credit_limit, current_balance,
      interest_rate, origination_date, maturity_date, status, notes,
      project_id, lender_id,
      projects ( name ),
      contacts ( name )
    `)
    .order("origination_date", { ascending: false, nullsFirst: false });

  const loans = loansData ?? [];

  // Compute total drawn per loan (for term loans)
  let drawnByLoan: Record<string, number> = {};

  if (loans.length > 0) {
    const { data: fundedLinks } = await supabase
      .from("draw_invoices")
      .select(`
        invoice_id,
        invoices ( amount, project_id ),
        loan_draws!inner ( lender_id, status )
      `)
      .eq("loan_draws.status", "funded");

    for (const link of fundedLinks ?? []) {
      const inv = link.invoices as { amount: number; project_id: string } | null;
      const draw = link.loan_draws as { lender_id: string; status: string } | null;
      if (!inv || !draw) continue;

      const matchingLoan = loans.find(
        (l) => l.project_id === inv.project_id && l.lender_id === draw.lender_id
      );
      if (matchingLoan) {
        drawnByLoan[matchingLoan.id] = (drawnByLoan[matchingLoan.id] ?? 0) + (inv.amount ?? 0);
      }
    }
  }

  return (
    <>
      <Header title="Loans" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-6xl mx-auto">
          <ReadOnlyBanner />
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-gray-500">
              {loans.length} loan{loans.length !== 1 ? "s" : ""}
            </p>
            <AdminOnly>
              <Link
                href="/banking/loans/new"
                className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
              >
                <Plus size={15} />
                New Loan
              </Link>
            </AdminOnly>
          </div>

          {loans.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
              No loans yet.{" "}
              <Link href="/banking/loans/new" className="text-[#4272EF] hover:underline">
                Add your first loan
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {["Loan #", "Type", "Project", "Lender", "Amount / Limit", "Drawn / Balance", "Available", "Origination", "Maturity", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loans.map((loan) => {
                    const project = loan.projects as { name: string } | null;
                    const lender = loan.contacts as { name: string } | null;
                    const isLOC = loan.loan_type === "line_of_credit";

                    // Line of credit: available = credit_limit - current_balance
                    // Term loan: available = loan_amount - drawn
                    const drawn = drawnByLoan[loan.id] ?? 0;
                    const limit = isLOC ? (loan.credit_limit ?? 0) : (loan.loan_amount ?? 0);
                    const used = isLOC ? (loan.current_balance ?? 0) : drawn;
                    const available = limit - used;
                    const pct = limit > 0 ? (used / limit) * 100 : 0;

                    return (
                      <tr key={loan.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">#{loan.loan_number}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isLOC ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                            {isLOC ? "Line of Credit" : "Term Loan"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{project?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{lender?.name ?? "—"}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{fmt(limit)}</td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-gray-700">{fmt(used)}</p>
                            {used > 0 && (
                              <div className="mt-1 w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-[#4272EF]"}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className={`px-4 py-3 font-medium ${available < 0 ? "text-red-600" : "text-gray-900"}`}>
                          {fmt(available)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{loan.origination_date ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{loan.maturity_date ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[loan.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {loan.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Link
                              href={`/banking/loans/${loan.id}/edit`}
                              className="p-1.5 text-gray-400 hover:text-[#4272EF] hover:bg-blue-50 rounded transition-colors"
                            >
                              <Pencil size={13} />
                            </Link>
                            <DeleteLoanButton loanId={loan.id} loanNumber={loan.loan_number} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
