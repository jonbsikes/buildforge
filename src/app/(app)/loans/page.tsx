import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Landmark } from "lucide-react";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Loan = Database["public"]["Tables"]["loans"]["Row"];
type Project = Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name">;
type Contact = Pick<Database["public"]["Tables"]["contacts"]["Row"], "id" | "name">;
type Draw = Pick<Database["public"]["Tables"]["loan_draws"]["Row"], "loan_id" | "amount_approved" | "status">;

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function pct(n: number) { return `${(n * 100).toFixed(2)}%`; }
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const loanTypeLabels: Record<string, string> = {
  construction: "Construction", land: "Land", lot: "Lot", bridge: "Bridge",
};
const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  paid_off: "bg-gray-100 text-gray-500",
  extended: "bg-amber-100 text-amber-700",
};

export default async function LoansPage() {
  const supabase = await createClient();

  const [loansRes, projectsRes, contactsRes, drawsRes] = await Promise.all([
    supabase.from("loans").select("*").order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name"),
    supabase.from("contacts").select("id, name").eq("type", "lender"),
    supabase.from("loan_draws").select("loan_id, amount_approved, status"),
  ]);

  const loans = (loansRes.data ?? []) as Loan[];
  const projects = (projectsRes.data ?? []) as Project[];
  const contacts = (contactsRes.data ?? []) as Contact[];
  const draws = (drawsRes.data ?? []) as Draw[];

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const contactMap = Object.fromEntries(contacts.map((c) => [c.id, c.name]));

  // Per-loan drawn amount
  const drawnByLoan: Record<string, number> = {};
  for (const draw of draws) {
    if (draw.status === "funded" && draw.amount_approved) {
      drawnByLoan[draw.loan_id] = (drawnByLoan[draw.loan_id] ?? 0) + draw.amount_approved;
    }
  }

  const totalCommitment = loans.filter((l) => l.status === "active").reduce((s, l) => s + l.total_amount, 0);
  const totalDrawn = loans.filter((l) => l.status === "active").reduce((s, l) => s + (drawnByLoan[l.id] ?? 0), 0);

  return (
    <>
      <Header title="Loans" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: "Active Loans", value: loans.filter((l) => l.status === "active").length },
            { label: "Total Commitment", value: fmt(totalCommitment) },
            { label: "Total Drawn", value: fmt(totalDrawn) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {loans.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
            <Landmark size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No loans yet. Add loans from the project page.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Loan #</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Project</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Lender</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Type</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Total</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Drawn</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Available</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Rate</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Maturity</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loans.map((loan) => {
                    const drawn = drawnByLoan[loan.id] ?? 0;
                    const available = loan.total_amount - drawn;
                    return (
                      <tr key={loan.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-mono text-xs text-gray-700">{loan.loan_number ?? "—"}</td>
                        <td className="px-5 py-3 text-gray-600 text-xs">{projectMap[loan.project_id] ?? "—"}</td>
                        <td className="px-5 py-3 text-gray-600 text-xs">{loan.lender_id ? contactMap[loan.lender_id] : "—"}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{loanTypeLabels[loan.loan_type] ?? loan.loan_type}</td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">{fmt(loan.total_amount)}</td>
                        <td className="px-5 py-3 text-right text-gray-700">{fmt(drawn)}</td>
                        <td className={`px-5 py-3 text-right font-medium ${available < 0 ? "text-red-600" : "text-green-600"}`}>{fmt(available)}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{pct(loan.interest_rate)} {loan.rate_type}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(loan.maturity_date)}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[loan.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {loan.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link href={`/projects/${loan.project_id}/loans/${loan.id}`} className="text-xs text-amber-600 hover:underline">
                            Manage →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
