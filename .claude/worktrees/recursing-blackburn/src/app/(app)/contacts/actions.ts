"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createContact(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("contacts").insert({
    user_id: user.id,
    name: formData.get("name") as string,
    type: (formData.get("type") as string) || "other",
    company: (formData.get("company") as string) || null,
    email: (formData.get("email") as string) || null,
    phone: (formData.get("phone") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/contacts");
}

export async function updateContact(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("contacts").update({
    name: formData.get("name") as string,
    type: (formData.get("type") as string) || "other",
    company: (formData.get("company") as string) || null,
    email: (formData.get("email") as string) || null,
    phone: (formData.get("phone") as string) || null,
    notes: (formData.get("notes") as string) || null,
  }).eq("id", id).eq("user_id", user.id);
  revalidatePath("/contacts");
}

export async function deleteContact(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("contacts").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/contacts");
}
