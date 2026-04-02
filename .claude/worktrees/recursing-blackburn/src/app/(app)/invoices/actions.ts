"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createInvoice(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const today = new Date().toISOString().split("T")[0];
  const dueDate = (formData.get("due_date") as string) || today;

  await supabase.from("invoices").insert({
    project_id: formData.get("project_id") as string,
    vendor_id: (formData.get("vendor_id") as string) || null,
    invoice_number: (formData.get("invoice_number") as string) || null,
    file_name: formData.get("file_name") as string,
    file_path: "",
    invoice_date: (formData.get("invoice_date") as string) || today,
    due_date: dueDate,
    total_amount: parseFloat(formData.get("total_amount") as string) || null,
    payment_method: (formData.get("payment_method") as string) || null,
    status: "pending_review",
    source: "upload",
    ai_confidence: "high",
    processed: false,
  });

  revalidatePath("/invoices");
}

export async function updateInvoiceStatus(
  id: string,
  status: string,
  extra?: { payment_date?: string; payment_method?: string }
) {
  const supabase = await createClient();

  const update: Record<string, unknown> = { status, processed: status === "paid" };
  if (extra?.payment_date) update.payment_date = extra.payment_date;
  if (extra?.payment_method) update.payment_method = extra.payment_method;

  await supabase.from("invoices").update(update).eq("id", id);

  // Post GL entry when payment is confirmed
  if (status === "paid") {
    const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).single();
    if (inv) {
      await supabase.from("gl_entries").insert({
        project_id: inv.project_id,
        entry_date: extra?.payment_date ?? new Date().toISOString().split("T")[0],
        description: `Invoice payment: ${inv.file_name}${inv.invoice_number ? ` #${inv.invoice_number}` : ""}`,
        debit_account: "2000",   // Accounts Payable
        credit_account: "1000",  // Cash
        amount: inv.total_amount ?? 0,
        source_type: "invoice_payment",
        source_id: id,
      });
    }
  }

  revalidatePath("/invoices");
}

export async function deleteInvoice(id: string) {
  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", id);
  revalidatePath("/invoices");
}
