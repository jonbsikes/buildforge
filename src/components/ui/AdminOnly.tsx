"use client";

import { useUserRole } from "@/components/layout/UserRoleContext";

/**
 * Only renders children if the current user is an admin.
 * Use this to wrap buttons and actions that should be hidden
 * for project_manager (read-only financial) users.
 */
export default function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useUserRole();

  if (loading || !isAdmin) return null;

  return <>{children}</>;
}
