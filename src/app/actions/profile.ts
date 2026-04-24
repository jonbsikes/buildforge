"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateDisplayName(displayName: string): Promise<void> {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) throw new Error("Display name cannot be empty");
  if (trimmed.length > 80) throw new Error("Display name is too long");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("user_profiles")
    .upsert({ id: user.id, display_name: trimmed }, { onConflict: "id" });
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
}
