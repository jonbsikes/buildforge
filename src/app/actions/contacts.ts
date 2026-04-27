"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateAfterContactMutation } from "@/lib/cache";

export interface ContactInput {
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  company?: string | null;
  notes?: string | null;
}

export async function createContact(
  data: ContactInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: row, error } = await supabase
    .from("contacts")
    .insert({
      user_id: user.id,
      name: data.name.trim(),
      type: data.type,
      email: data.email || null,
      phone: data.phone || null,
      company: data.company ?? null,
      notes: data.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidateAfterContactMutation();
  return { id: row.id };
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

  const update: Record<string, string | null> = {
    name: data.name.trim(),
    type: data.type,
    email: data.email || null,
    phone: data.phone || null,
  };
  if (data.company !== undefined) update.company = data.company;
  if (data.notes !== undefined) update.notes = data.notes;

  const { error } = await supabase
    .from("contacts")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidateAfterContactMutation();
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

  // Check if contact is referenced on any draw
  const { count: drawCount } = await supabase
    .from("loan_draws")
    .select("id", { count: "exact", head: true })
    .eq("lender_id", id);

  if (drawCount && drawCount > 0) {
    return {
      error:
        "This contact is linked to one or more draws and cannot be deleted.",
    };
  }

  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidateAfterContactMutation();
  return {};
}
