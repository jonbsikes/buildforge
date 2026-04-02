import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import EditInvoiceForm from "@/components/invoices/EditInvoiceForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditInvoicePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [invoiceResult, lineItemsResult, vendorsResult, projectsResult, costCodesResult] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(`
          id, vendor, vendor_id, invoice_number, invoice_date, due_date,
          status, payment_method, ai_confidence, ai_notes, pending_draw,
          project_id, contract_id, projects ( id, name )
        `)
        .eq("id", id)
        .single(),

      supabase
        .from("invoice_line_items")
        .select("cost_code, description, amount")
        .eq("invoice_id", id)
        .order("created_at"),

      supabase
        .from("vendors")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),

      supabase
        .from("projects")
        .select("id, name, project_type")
        .in("status", ["active", "planning"])
        .order("name"),

      supabase
        .from("cost_codes")
        .select("id, code, name")
        .is("user_id", null)
        .order("code"),
    ]);

  if (!invoiceResult.data) notFound();

  const invoice = invoiceResult.data;

  // paid invoices are read-only
  if (invoice.status === "paid") {
    redirect(`/invoices/${id}`);
  }

  // Check if in funded draw — redirect if locked
  const { data: drawLinks } = await supabase
    .from("draw_invoices")
    .select("draw_id")
    .eq("invoice_id", id);

  const drawIds = (drawLinks ?? []).map((l) => l.draw_id);
  if (drawIds.length > 0) {
    const { data: funded } = await supabase
      .from("loan_draws")
      .select("id")
      .in("id", drawIds)
      .eq("status", "funded")
      .limit(1);
    if (funded && funded.length > 0) redirect(`/invoices/${id}`);
  }

  const project = invoice.projects as { id: string; name: string } | null;

  // Fetch contracts for the invoice's project (if any)
  const contractsResult = invoice.project_id
    ? await supabase
        .from("contracts")
        .select("id, amount, status, cost_codes ( code, name )")
        .eq("project_id", invoice.project_id)
        .in("status", ["draft", "active", "signed"])
        .order("created_at")
    : { data: [] };

  // Sort cost codes numerically
  const costCodes = (costCodesResult.data ?? []).sort(
    (a, b) => parseInt(a.code, 10) - parseInt(b.code, 10)
  );

  return (
    <>
      <Header title="Edit Invoice" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <Link
            href={`/invoices/${id}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors mb-5 block"
          >
            ← Invoice
          </Link>
          <EditInvoiceForm
            invoiceId={id}
            initial={{
              project_id: invoice.project_id ?? null,
              vendor_id: invoice.vendor_id ?? null,
              vendor: invoice.vendor ?? null,
              invoice_number: invoice.invoice_number ?? null,
              invoice_date: invoice.invoice_date ?? null,
              due_date: invoice.due_date ?? null,
              pending_draw: invoice.pending_draw ?? false,
              status: invoice.status,
              payment_method: invoice.payment_method ?? null,
              ai_confidence: invoice.ai_confidence ?? null,
              ai_notes: invoice.ai_notes ?? null,
              contract_id: invoice.contract_id ?? null,
              line_items: (lineItemsResult.data ?? []).map((li) => ({
                cost_code: li.cost_code ?? "",
             