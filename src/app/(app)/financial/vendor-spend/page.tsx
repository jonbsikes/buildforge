import Header from "@/components/layout/Header";
import VendorSpendClient, { type VendorSpendRow } from "@/components/financial/VendorSpendClient";
import { createClient } from "@/lib/supabase/server";

// Server-first report (Package 05 §B): invoice rows load + shape here; the
// client only handles project/date filtering and expansion.
export default async function VendorSpendPage() {
  const supabase = await createClient();

  const { data: invoiceRows } = await supabase
    .from("invoices")
    .select("vendor, project_id, cost_code_id, amount, total_amount, invoice_date, status, projects(name), cost_codes(code, name)")
    .in("status", ["approved", "released", "cleared"])
    .order("vendor");

  const invoices: VendorSpendRow[] = (invoiceRows ?? []).map((inv) => {
    const project = inv.projects as { name: string } | null;
    const costCode = inv.cost_codes as { code: string; name: string } | null;
    return {
      vendor: inv.vendor ?? "Unknown Vendor",
      project: project?.name ?? "No Project",
      cost_code: costCode ? `${costCode.code} — ${costCode.name}` : "—",
      amount: inv.total_amount ?? inv.amount ?? 0,
      invoice_date: inv.invoice_date ?? "",
      status: inv.status,
    };
  });

  return (
    <>
      <Header title="Vendor Spend Report" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <VendorSpendClient invoices={invoices} />
      </main>
    </>
  );
}
