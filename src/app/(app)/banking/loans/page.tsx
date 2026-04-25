import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, Pencil, Banknote } from "lucide-react";
import DeleteLoanButton from "@/components/banking/DeleteLoanButton";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";
import AdminOnly from "@/components/ui/AdminOnly";
import MetadataChip from "@/components/ui/MetadataChip";
import StatusBadge, { type StatusKind } from "@/components/ui/StatusBadge";
import Money from "@/components/ui/Money";
import DateValue from "@/components/ui/DateValue";
import CapacityBar from "@/components/ui/CapacityBar";
import EmptyState from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

const STATUS_KIND: Record<string, StatusKind> = {
  active: "active",
  paid_off: "complete",
  in_default: "over",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  paid_off: "Paid off",
  in_default: "In default",
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
  const drawnByLoan: Record<string, number> = {};

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
      <Header
        title="Loans"
        breadcrumbs={[
          { label: "Banking", href: "/banking/accounts" },
          { label: "Loans" },
        ]}
      />
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
            <div className="bg-white rounded-xl border border-gray-200">
              <EmptyState
                icon={<Banknote size={20} />}
                title="No loans yet"
                description="Loans track lender commitments and current outstanding balance. Each loan ties to a project and a lender contact, and its balance grows as draws are funded."
                primary={{ label: "+ Add your first loan", href: "/banking/loans/new" }}
              />
            </div>
          ) : (
            // Per UI Review § 08 #51: card layout (was 11-column horizontal-scroll table).
            // The "drawn vs available" capacity bar is the headline signal.
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loans.map((loan) => {
                const project = loan.projects as { name: string } | null;
                const lender = loan.contacts as { name: string } | null;
                const isLOC = loan.loan_type === "line_of_credit";

                const drawn = drawnByLoan[loan.id] ?? 0;
                const limit = isLOC ? (loan.credit_limit ?? 0) : (loan.loan_amount ?? 0);
                const used = isLOC ? (loan.current_balance ?? 0) : drawn;
                const available = limit - used;

                return (
                  <div
                    key={loan.id}
                    className="bg-white rounded-xl border border-gray-200 hover:border-gray-400 transition-colors p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/banking/loans/${loan.id}/edit`}
                            className="font-semibold text-gray-900 hover:text-[#4272EF] transition-colors truncate"
                          >
                            Loan #{loan.loan_number}
                          </Link>
                          <MetadataChip variant={isLOC ? "accent" : "default"}>
                            {isLOC ? "Line of Credit" : "Term Loan"}
                          </MetadataChip>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {project?.name ?? "—"} · {lender?.name ?? "—"}
                        </p>
                      </div>
                      <StatusBadge status={STATUS_KIND[loan.status] ?? "neutral"} size="sm">
                        {STATUS_LABEL[loan.status] ?? loan.status.replace(/_/g, " ")}
                      </StatusBadge>
                    </div>

                    <div className="flex items-baseline justify-between mb-1.5">
                      <Money value={used} className="text-2xl font-semibold" />
                      <span className="text-xs text-gray-500">
                        of <Money value={limit} className="text-gray-700 font-medium" />
                      </span>
                    </div>
                    <CapacityBar used={used} total={limit} />
                    <p className="text-xs text-gray-500 mt-1.5">
                      <Money
                        value={available}
                        tone={available < 0 ? "negative" : "default"}
                        className="font-medium"
                      />{" "}
                      available
                    </p>

                    <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100 text-xs">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">
                          Origination
                        </p>
                        <DateValue value={loan.origination_date} className="text-gray-700" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">
                          Maturity
                        </p>
                        <DateValue value={loan.maturity_date} className="text-gray-700" />
                      </div>
                      {loan.interest_rate != null && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">
                            Rate
                          </p>
                          <span className="text-gray-700 tabular-nums">{loan.interest_rate}%</span>
                        </div>
                      )}
                    </div>

                    <AdminOnly>
                      <div className="flex justify-end gap-1 mt-3">
                        <Link
                          href={`/banking/loans/${loan.id}/edit`}
                          aria-label={`Edit loan ${loan.loan_number}`}
                          className="p-1.5 text-gray-400 hover:text-[#4272EF] hover:bg-blue-50 rounded transition-colors"
                        >
                          <Pencil size={13} />
                        </Link>
                        <DeleteLoanButton loanId={loan.id} loanNumber={loan.loan_number} />
                      </div>
                    </AdminOnly>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
