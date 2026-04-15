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
 * Uses a SECURITY DEFINER database function to bypass RLS and prevent
 * silent query failures that would incorrectly downgrade admin users.
 * Returns null if not authenticated.
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Use SECURITY DEFINER function — bypasses RLS so role lookup never silently fails
  const { data, error } = await supabase.rpc("get_my_role");

  if (error || !data) {
    // Fallback: user exists but function call failed — treat as project_manager
    return {
      id: user.id,
      display_name: user.email?.split("@")[0] ?? "User",
      role: "project_manager",
    };
  }

  return {
    id: (data as { id: string }).id ?? user.id,
    display_name: (data as { display_name: string }).display_name ?? user.email?.split("@")[0] ?? "User",
    role: ((data as { role: string }).role as UserRole) ?? "project_manager",
  };
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
    return { authorized: false, error: "You don't have permission to perform this action" };
  }

  return { authorized: true };
}
