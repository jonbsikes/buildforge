"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export interface ContractInput {
  project_id: string;
  description: string;
  vendor_id: string;
  cost_code_id: string;
  amount: string;
  status: string;
  signed_date: string;
  notes: string;
}

export async function createContract(input: ContractInput): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };
  const supabase = await createClient();
  const { error } = await supabase.from("contracts").insert({
    project_id: input.project_id,
    description: input.description.trim(),
    vendor_id: input.vendor_id || null,
    cost_code_id: input.cost_code_id || null,
    amount: input.amount ? parseFloat(input.amount) : 0,
    status: input.status,
    signed_date: input.signed_date || null,
    notes: input.notes.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/contracts");
  return {};
}

export async function updateContract(id: string, input: ContractInput): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      project_id: input.project_id,
      description: input.description.trim(),
      vendor_id: input.vendor_id || null,
      cost_code_id: input.cost_code_id || null,
      amount: input.amount ? parseFloat(input.amount) : 0,
      status: input.status,
      signed_date: input.signed_date || null,
      notes: input.notes.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${id}/edit`);
  return {};
}

export async function deleteContract(id: string): Promise<{ error?: string }> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return { error: adminCheck.error };
  const supabase = await createClient();
  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/contracts");
  redirect("/contracts");
}
