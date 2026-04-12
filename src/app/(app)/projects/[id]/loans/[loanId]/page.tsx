// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import LoanDetailClient from "./LoanDetailClient";

export const dynamic = "force-dynamic";

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string; loanId: string }> }) {
  const { id, loanId } = await params;
  const supabase = await createClient();

  const [projectRes, loanRes, drawsRes, paymentsRes, invoicesRes, costCodesRes, contactsRes] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", id).single(),
    supabase.from("loans").select("*").eq("id", loanId).single(),
    supabase.from("loan_draws").select("*, loan_draw_items(*)").eq("loan_id", loanId).order("draw_number"),
    supabase.from("loan_payments").select("*").eq("loan_id", loanId).order("payment_date"),
    supabase.from("invoices").select("id, invoice_number, vendor, amount, total_amount, cost_code, status")
      .eq("project_id", id).in("status", ["approved", "scheduled", "released", "cleared"]),
    supabase.from("cost_codes").select("code, description").order("code"),
    supabase.from("contacts").select("id, name"),
  ]);

  if (!projectRes.data || !loanRes.data) notFound();

  return (
    <>
      <Header title="Loan Details" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <Link href={`/projects/${id}/loans`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
            <ArrowLeft size={15} /> {projectRes.data.name} — Loans
          </Link>
          <LoanDetailClient
            projectId={id}
            loan={loanRes.data}
            draws={drawsRes.data ?? []}
            payments={paymentsRes.data ?? []}
            availableInvoices={invoicesRes.data ?? []}
            costCodes={costCodesRes.data ?? []}
            contacts={contactsRes.data ?? []}
          />
        </div>
      </main>
    </>
  );
}
