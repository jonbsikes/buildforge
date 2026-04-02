"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface ContactInput {
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
}

export async function createContact(
  data: ContactInput
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("contacts").insert({
    user_id: user.id,
    name: data.name.trim(),
    type: data.type,
    email: data.email || null,
    phone: data.phone || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/contacts");
  return {};
}

export async function updateContact(
  id: string,
  data: ContactInput
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("contacts")
    .update({
      name: data.name.trim(),
      type: data.type,
      email: data.email || null,
      phone: data.phone || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/contacts");
  return {};
}

export async function deleteContact(
  id: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Check if contact is referenced as a lender on any project
  const { count: projectCount } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("lender_id", id);

  if (projectCount && projectCount > 0) {
    return {
      error:
        "This contact is linked to one or more projects or loans and cannot be deleted.",
    };
  }

  // Check if contact is referenced on any loan
  const { count: loanCount } = await supabase
    .from("loans")
    .select("id", { count: "exact", head: true })
    .eq("lender_id", id);

  if (loanCount && loanCount > 0) {
    return {
      error:
        "This contact is linked to one or more projects or loans and cannot be deleted.",
    };
  }

  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/contacts");
  return {};
}
