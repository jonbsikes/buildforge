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
  await supabase.from("loan_draws").update({ status }).eq("id", id);
  revalidatePath("/draws");
}

export async function deleteDraw(id: string) {
  const supabase = await createClient();
  await supabase.from("loan_draws").delete().eq("id", id);
  revalidatePath("/draws");
}
