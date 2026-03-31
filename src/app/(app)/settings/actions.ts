"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export async function createCostCode(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("cost_codes").insert({
    user_id: user.id,
    code: formData.get("code") as string,
    name: formData.get("name") as string,
    category: (formData.get("category") as Database["public"]["Enums"]["cost_category"]) || "other",
    project_type: (formData.get("project_type") as Database["public"]["Enums"]["project_type"]) || null,
    is_active: true,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function toggleCostCode(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("cost_codes").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function deleteCostCode(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("cost_codes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
