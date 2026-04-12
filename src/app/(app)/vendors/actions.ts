"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createVendor(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("vendors").insert({
    user_id: user.id,
    name: formData.get("name") as string,
    trade: (formData.get("trade") as string) || null,
    email: (formData.get("email") as string) || null,
    phone: (formData.get("phone") as string) || null,
    coi_expiry_date: (formData.get("coi_expiry_date") as string) || null,
    license_expiry_date: (formData.get("license_expiry_date") as string) || null,
  });
  revalidatePath("/vendors");
}

export async function updateVendor(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("vendors").update({
    name: formData.get("name") as string,
    trade: (formData.get("trade") as string) || null,
    email: (formData.get("email") as string) || null,
    phone: (formData.get("phone") as string) || null,
    coi_expiry_date: (formData.get("coi_expiry_date") as string) || null,
    license_expiry_date: (formData.get("license_expiry_date") as string) || null,
  }).eq("id", id).eq("user_id", user.id);
  revalidatePath("/vendors");
}

export async function deleteVendor(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("vendors").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/vendors");
}
