"use client";

import { useUserRole } from "@/components/layout/UserRoleContext";
import { Eye } from "lucide-react";

/**
 * Shows a subtle banner for non-admin users on financial pages.
 * Renders nothing for admin users.
 */
export default function ReadOnlyBanner() {
  const { isAdmin, loading } = useUserRole();

  if (loading || isAdmin) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm mb-4">
      <Eye size={16} />
      <span>You have view-only access to financial data.</span>
