"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface VendorFormData {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  trades: string[]; // stored as JSON in the `trade` column
  coi_expiry_date: string | null;
  license_expiry_date: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// createVendor
// ---------------------------------------------------------------------------
export async function createVendor(
  data: VendorFormData
): Promise<{ error?: string; vendorId?: string }> {
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
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Generate notifications now that a new vendor exists
  await supabase.rpc("generate_notifications");

  revalidatePath("/vendors");
  return { vendorId: vendor.id };
}

// ---------------------------------------------------------------------------
// updateVendor
// ---------------------------------------------------------------------------
export async function updateVendor(
  id: string,
  data: VendorFormData
): Promise<{ error?: string }> {
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
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.rpc("generate_notifications");

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  return {};
}

// ---------------------------------------------------------------------------
// deactivateVendor
// ---------------------------------------------------------------------------
export async function deactivateVendor(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/vendors");
  return {};
}

// ---------------------------------------------------------------------------
// runNotifications — called on page load to refresh expiry notifications
// ---------------------------------------------------------------------------
export async function runNotifications(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("generate_notifications");
}
