import Header from "@/components/layout/Header";
import APAgingClient, { type APAgingInitialData } from "@/components/financial/APAgingClient";
import { createClient } from "@/lib/supabase/server";

// Server-first report (Package 05 §B): all four datasets load here in
// parallel; the client shapes and filters them without a spinner.
export default async function APAgingPage() {
  const supabase = await createClient();

  const [
    { data: invoices },
    { data: outstandingPayments },
    { data: creditRows },
    { data: projectList },
  ] = await Promise.all([
    // AP aging = APPROVED invoices only — those are the ones sitting in
    // GL account 2000. pending_review has no JE yet (shown separately);
    // released has already moved to 2050 (outstanding checks card).
    supabase
      .from("invoices")
      .select("id, vendor, invoice_number, invoice_date, due_date, amount, status, project_id, projects(id, name)")
      .in("status", ["pending_review", "approved"])
      .order("due_date"),
    // Outstanding (written but not cashed) checks from the Payment Register —
    // matches the 2050 (Checks Issued - Outstanding) GL balance. Net amount
    // in 2050 is amount − discount_amount − credits_applied.
    supabase
      .from("payments")
      .select(`
        id, payee, amount, discount_amount, credits_applied,
        payment_number, payment_date, draw_id, payment_method, status,
        loan_draws ( id, draw_date )
      `)
      .eq("status", "outstanding")
      .eq("payment_method", "check")
      .order("payment_date", { ascending: true }),
    // Vendor credits with remaining balance > 0 — these reduce the vendor's
    // net AP so the report ties out to the GL.
    supabase
      .from("vendor_credits")
      .select(`
        id, credit_date, credit_number, reason, amount, applied_amount,
        vendors ( name ), projects ( name )
      `)
      .eq("status", "available")
      .order("credit_date", { ascending: true }),
    supabase.from("projects").select("id, name").order("name"),
  ]);

  const initialData = {
    invoices: invoices ?? [],
    outstandingPayments: outstandingPayments ?? [],
    creditRows: creditRows ?? [],
    projectList: projectList ?? [],
  } as unknown as APAgingInitialData;

  return (
    <>
      <Header title="AP Aging" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <APAgingClient initialData={initialData} />
      </main>
    </>
  );
}
