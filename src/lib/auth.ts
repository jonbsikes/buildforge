"use server";

import { createClient } from "@/lib/supabase/server";

export type UserRole = "admin" | "project_manager";

export interface UserProfile {
  id: string;
  display_name: string;
  role: UserRole;
}

/**
 * Fetches the current user's profile (including role).
 * Returns null if not authenticated or no profile exists.
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("user_profiles")
    .select("id, display_name, role")
    .eq("id", user.id)
    .single();

  if (!data) {
    // Fallback: user exists but no profile row yet — treat as project_manager
    return {
      id: user.id,
      display_name: user.email?.split("@")[0] ?? "User",
      role: "project_manager",
    };
  }

  return data as UserProfile;
}

/**
 * Returns true if the current user has the 'admin' role.
 * Use this in server actions to guard financial write operations.
 */
export async function requireAdmin(): Promise<{ authorized: boolean; error?: string }> {
  const profile = await getUserProfile();

  if (!profile) {
    return { authorized: false, error: "Not authenticated" };
  }

  if (profile.role !== "admin") {
    return { authorized: false, error: "You don't have permission to perform 