"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type UserRole = "admin" | "project_lead" | "project_manager";

interface UserRoleContextValue {
  role: UserRole;
  isAdmin: boolean;
  canEdit: boolean;
  loading: boolean;
}

const UserRoleContext = createContext<UserRoleContextValue>({
  role: "project_manager",
  isAdmin: false,
  canEdit: false,
  loading: true,
});

export function UserRoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>("project_manager");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Use SECURITY DEFINER function — bypasses RLS so role lookup never silently fails
        const { data } = await supabase.rpc("get_my_role");
        const profile = data as { role?: string } | null;

        if (profile?.role) {
          setRole(profile.role as UserRole);
        }
      }
      setLoading(false);
    }

    fetchRole();
  }, []);

  const isAdmin = role === "admin";
  const canEdit = role === "admin" || role === "project_lead";

  return (
    <UserRoleContext.Provider value={{ role, isAdmin, canEdit, loading }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(UserRoleContext);
}
