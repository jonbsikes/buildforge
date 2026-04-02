"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createDraw(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("loan_draws").insert({
    project_id: formData.get("project_id") as string,
    lender_id: (formData.get("lender_id") as string) || null,
    draw_number: parseInt(formData.get("draw_number") as string),
    draw_date: formData.get("draw_date") as string,
    total_amount: parseFloat(formData.get("total_amount") as string) || 0,
    notes: (formData.get("notes") as string) || null,
    status: "draft",
  });
  revalidatePath("/draws");
}

export async function updateDrawStatus(id: string, status: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("loan_draws").update({ status }).eq("id", id);
  revalidatePath("/draws");
}

export async function deleteDraw(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Only draft draws can be deleted — funded/submitted/paid draws are locked
  const { data: draw } = await supabase
    .from("loan_draws")
    .select("status")
    .eq("id", id)
    .single();

  if (!draw) throw new Error("Draw not found");
  if (draw.status !== "draft") {
    throw new Error(`Cannot delete a ${draw.status} draw — only draft draws can be deleted`);
  }

  await supabase.from("draw_invoices").delete().eq("draw_id", id);
  await supabase.from("loan_draws").delete().eq("id", id);
  revalidatePath("/draws");
}
