// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus, TrendingUp, AlertTriangle } from "lucide-react";
import BudgetClient from "./BudgetClient";

export const dynamic = "force-dynamic";

export default async function ProjectBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectRes, budgetRes, costCodesRes, invoicesRes] = await Promise.all([
    supabase.from("projects").select("id, name, contract_price, status").eq("id", id).single(),
    supabase.from("project_budget").select("*").eq("project_id", id),
    supabase.from("cost_codes").select("code, category, description").order("code"),
    supabase.from("invoices").select("cost_code, amount, total_amount, status").eq("project_id", id),
  ]);

  if (!projectRes.data) notFound();

  const project = projectRes.data;
  const budgetRows = budgetRes.data ?? [];
  const costCodes = costCodesRes.data ?? [];
  const invoices = invoicesRes.data ?? [];

  // Compute actual_amount from paid/approved invoices per cost code
  const invoiceActuals: Record<number, number> = {};
  for (const inv of invoices) {
    if (!inv.cost_code || !["approved", "scheduled", "paid"].includes(inv.status ?? "")) continue;
    const amt = inv.amount ?? inv.total_amount ?? 0;
    invoiceActuals[inv.cost_code] = (invoiceActuals[inv.cost_code] ?? 0) + amt;
  }

  return (
    <>
      <Header title="Project Budget" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <Link href={`/projects/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
            <ArrowLeft size={15} /> {project.name}
          </Link>

          <BudgetClient
            projectId={id}
            contractPrice={project.contract_price}
            budgetRows={budgetRows}
            costCodes={costCodes}
            invoiceActuals={invoiceActuals}
          />
        </div>
      </main>
    </>
  );
}
