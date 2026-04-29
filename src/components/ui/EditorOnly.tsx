"use client";

import { useUserRole } from "@/components/layout/UserRoleContext";

/**
 * Renders children if the current user can edit (admin or project_lead).
 * Use this to wrap project/vendor/contact/document/invoice-intake buttons
 * that should be hidden for read-only project_manager users.
 *
 * For financial-only actions (invoice approval, draws, banking, JEs), use
 * AdminOnly instead.
 */
export default function EditorOnly({ children }: { children: React.ReactNode }) {
  const { canEdit, loading } = useUserRole();

  if (loading || !canEdit) return null;

  return <>{children}</>;
}
