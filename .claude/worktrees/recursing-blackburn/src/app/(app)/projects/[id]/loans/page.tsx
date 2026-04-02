// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, Landmark } from "lucide-react";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Loan = Database["public"]["Tables"]["loans"]["Row"];
type Draw = Pick<Database["public"]["Tables"]["loan_draws"]["Row"], "loan_id" | "amount_approved" | "status">;
type Contact = Pick<Database["public"]["Tables"]["contacts"]["Row"], "id" | "name">;

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ProjectLoansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, loansRes, contactsRes, drawsRes] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).single(),
    supabase.from("loans").select("*").eq("project_id", id).order("created_at"),
    supabase.from("contacts").select("id, name"),
    supabase.from("loan_draws").select("loan_id, amount_approved, status"),
  ]);

  if (!projectRes.data) notFound();

  const loans = (loansRes.data ?? []) as Loan[];
  const contacts = (contactsRes.data ?? []) as Contact[];
  const draws = (drawsRes.data ?? []) as Draw[];
  const contactMap = Object.fromEntries(contacts.map((c) => [c.id, c.name]));

  const drawnByLoan: Record<string, number> = {};
  for (const draw of draws) {
    if (draw.status === "funded" && draw.amount_approved) {
      drawnByLoan[draw.loan_id] = (drawnByLoan[draw.loan_id] ?? 0) + draw.amount_approved;
    }
  }

  return (
    <>
      <Header title="Loans" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <Link href={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
            <ArrowLeft size={15} /> {projectRes.data.name}
          </Link>

          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-900">Project Loans</h2>
            <Link href={`/projects/${id}/loans/new`}
              className="inline-flex items-center gap-2 bg-amber-500 text-gray-900 font-medium px-4 py-2 rounded-lg text-sm hover:bg-amber-400 transition-colors">
              <Plus size={15} /> Add Loan
            </Link>
          </div>

          {loans.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
              <Landmark size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No loans on this project yet.</p>
              <Link href={`/projects/${id}/loans/new`} className="mt-2 inline-block text-sm text-amber-600 hover:underline">Add a loan</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {loans.map((loan) => {
                const drawn = drawnByLoan[loan.id] ?? 0;
                const available = loan.total_amount - drawn;
                const drawPct = loan.total_amount > 0 ? (drawn / loan.total_amount) * 100 : 0;
                return (
                  <div key={loan.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{loan.loan_number ?? "Loan"} — {loan.loan_type}</h3>
                        <p className="text-sm text-gray-500">{loan.lender_id ? contactMap[loan.lender_id] : "No lender"} · {(loan.interest_rate * 100).toFixed(2)}% {loan.rate_type}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          loan.status === "active" ? "bg-green-100 text-green-700" :
                          loan.status === "paid_off" ? "bg-gray-100 text-gray-500" :
                          "bg-amber-100 text-amber-700"
                        }`}>{loan.status.replace("_", " ")}</span>
                        <Link href={`/projects/${id}/loans/${loan.id}`}
                          className="text-sm text-amber-600 hover:underline font-medium">Manage →</Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      {[
                        { label: "Total Commitment", value: fmt(loan.total_amount) },
                        { label: "Drawn", value: fmt(drawn) },
                        { label: "Available", value: fmt(available), highlight: available < 0 },
                      ].map(({ label, value, highlight }) => (
                        <div key={label}>
                          <p className="text-xs text-gray-400">{label}</p>
                          <p className={`text-lg font-bold ${highlight ? "text-red-600" : "text-gray-900"}`}>{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${drawPct > 90 ? "bg-red-400" : drawPct > 70 ? "bg-amber-400" : "bg-green-400"}`}
                        style={{ width: `${Math.min(drawPct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>{drawPct.toFixed(1)}% drawn</span>
                      <span>Maturity: {fmtDate(loan.maturity_date)}</span>
                    </div>
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
