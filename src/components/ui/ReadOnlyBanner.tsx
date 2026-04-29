"use client";

import { useUserRole } from "@/components/layout/UserRoleContext";
import { Eye } from "lucide-react";

interface Props {
  /**
   * `admin` (default): banner shows for any non-admin user — use on purely
   * financial pages (banking, draws, journal entries) where project_lead is
   * also read-only.
   *
   * `editor`: banner shows only for users without edit access (project_manager)
   * — use on pages where project_lead has partial edit ability (e.g. invoices,
   * where they can add but not approve).
   */
  audience?: "admin" | "editor";
}

/**
 * Shows a subtle banner for users without write access on the current page.
 * Renders nothing for users who can edit it.
 */
export default function ReadOnlyBanner({ audience = "admin" }: Props = {}) {
  const { isAdmin, canEdit, loading } = useUserRole();

  if (loading) return null;
  if (audience === "admin" && isAdmin) return null;
  if (audience === "editor" && canEdit) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm mb-4">
      <Eye size={16} />
      <span>You have view-only access to financial data.</span>
    </div>
  );
}
