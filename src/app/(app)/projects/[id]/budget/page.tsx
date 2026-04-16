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

  const [projectRes, budgetRes, costCodesRes, lineItemsRes] = await Promise.all([
    supabase.from("projects").select("id, name, contract_price, status").eq("id", id).single(),
    supabase.from("project_budget").select("*").eq("project_id", id),
    supabase.from("cost_codes").select("code, category, description").order("code"),
    supabase
      .from("invoice_line_items")
      .select("cost_code, amount, invoices!inner ( status )")
      .eq("project_id", id)
      .in("invoices.status", ["approved", "scheduled", "released", "cleared"]),
  ]);

  if (!projectRes.data) notFound();

  const project = projectRes.data;
  const budgetRows = budgetRes.data ?? [];
  const costCodes = costCodesRes.data ?? [];
  const lineItems = lineItemsRes.data ?? [];

  // Compute actual_amount from line items attributed to this project
  const invoiceActuals: Record<number, number> = {};
  for (const li of lineItems) {
    if (!li.cost_code) continue;
    const code = typeof li.cost_code === "string" ? parseInt(li.cost_code, 10) : li.cost_code;
    const amt = li.amount ?? 0;
    invoiceActuals[code] = (invoiceActuals[code] ?? 0) + amt;
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
