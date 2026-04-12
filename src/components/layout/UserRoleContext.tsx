"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type UserRole = "admin" | "project_manager";

interface UserRoleContextValue {
  role: UserRole;
  isAdmin: boolean;
  loading: boolean;
}

const UserRoleContext = createContext<UserRoleContextValue>({
  role: "project_manager",
  isAdmin: false,
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
        const { data } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (data?.role) {
          setRole(data.role as UserRole);
        }
      }
      setLoading(false);
    }

    fetchRole();
  }, []);

  return (
    <UserRoleContext.Provider value={{ role, isAdmin: role === "admin", loading }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function us