"use server";

import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/auth";
import { revalidateAfterVendorMutation } from "@/lib/cache";

export interface VendorFormData {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  trades: string[]; // stored as JSON in the `trade` column
  coi_expiry_date: string | null;
  license_expiry_date: string | null;
  notes: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  accounting_contact_name: string | null;
  accounting_contact_email: string | null;
  accounting_contact_phone: string | null;
  ach_bank_name: string | null;
  ach_routing_number: string | null;
  ach_account_number: string | null;
  ach_account_type: string | null;
}

// ---------------------------------------------------------------------------
// createVendor
// ---------------------------------------------------------------------------
export async function createVendor(
  data: VendorFormData
): Promise<{ error?: string; vendorId?: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return { error: editorCheck.error };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: vendor, error } = await supabase
    .from("vendors")
    .insert({
      user_id: user.id,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      trade: data.trades.length > 0 ? JSON.stringify(data.trades) : null,
      coi_expiry_date: data.coi_expiry_date || null,
      license_expiry_date: data.license_expiry_date || null,
      notes: data.notes || null,
      is_active: true,
      primary_contact_name: data.primary_contact_name || null,
      primary_contact_email: data.primary_contact_email || null,
      primary_contact_phone: data.primary_contact_phone || null,
      accounting_contact_name: data.accounting_contact_name || null,
      accounting_contact_email: data.accounting_contact_email || null,
      accounting_contact_phone: data.accounting_contact_phone || null,
      ach_bank_name: data.ach_bank_name || null,
      ach_routing_number: data.ach_routing_number || null,
      ach_account_number: data.ach_account_number || null,
      ach_account_type: data.ach_account_type || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Generate notifications now that a new vendor exists
  await supabase.rpc("generate_notifications");

  revalidateAfterVendorMutation();
  return { vendorId: vendor.id };
}

// ---------------------------------------------------------------------------
// updateVendor
// ---------------------------------------------------------------------------
export async function updateVendor(
  id: string,
  data: VendorFormData
): Promise<{ error?: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return { error: editorCheck.error };
  const supabase = await createClient();

  const { error } = await supabase
    .from("vendors")
    .update({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      trade: data.trades.length > 0 ? JSON.stringify(data.trades) : null,
      coi_expiry_date: data.coi_expiry_date || null,
      license_expiry_date: data.license_expiry_date || null,
      notes: data.notes || null,
      primary_contact_name: data.primary_contact_name || null,
      primary_contact_email: data.primary_contact_email || null,
      primary_contact_phone: data.primary_contact_phone || null,
      accounting_contact_name: data.accounting_contact_name || null,
      accounting_contact_email: data.accounting_contact_email || null,
      accounting_contact_phone: data.accounting_contact_phone || null,
      ach_bank_name: data.ach_bank_name || null,
      ach_routing_number: data.ach_routing_number || null,
      ach_account_number: data.ach_account_number || null,
      ach_account_type: data.ach_account_type || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.rpc("generate_notifications");

  revalidateAfterVendorMutation();
  return {};
}

// ---------------------------------------------------------------------------
// deactivateVendor
// ---------------------------------------------------------------------------
export async function deactivateVendor(id: string): Promise<{ error?: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return { error: editorCheck.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateAfterVendorMutation();
  return {};
}

// ---------------------------------------------------------------------------
// deleteVendor — hard delete. Caller should be certain the vendor has no
// dependent invoices/contracts; RLS + FKs will block unsafe deletes.
// ---------------------------------------------------------------------------
export async function deleteVendor(id: string): Promise<{ error?: string }> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return { error: editorCheck.error };
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("vendors")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidateAfterVendorMutation();
  return {};
}

// ---------------------------------------------------------------------------
// runNotifications — called on page load to refresh expiry notifications
// ---------------------------------------------------------------------------
export async function runNotifications(): Promise<void> {
  const editorCheck = await requireEditor();
  if (!editorCheck.authorized) return;
  const supabase = await createClient();
  await supabase.rpc("generate_notifications");
}
