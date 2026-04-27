"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateAfterProfileMutation } from "@/lib/cache";

export async function updateDisplayName(displayName: string): Promise<void> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) throw new Error("Display name cannot be empty");
  if (trimmed.length > 80) throw new Error("Display name is too long");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Try update first
  const { error, count } = await supabase
    .from("user_profiles")
    .update({ display_name: trimmed }, { count: "exact" })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  // If no row exists, create one with default role (uses upsert to avoid race)
  if (count === 0) {
    const { error: upsertError } = await supabase
      .from("user_profiles")
      .upsert(
        { id: user.id, display_name: trimmed, role: "project_manager" },
        { onConflict: "id", ignoreDuplicates: true }
      );
    if (upsertError) throw new Error(upsertError.message);
  }

  revalidateAfterProfileMutation();
}
