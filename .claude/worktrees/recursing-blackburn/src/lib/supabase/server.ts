import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  // Cast needed: @supabase/ssr 0.6.x passes generics in the old 3-param order
  // but supabase-js 2.101+ changed the SupabaseClient generic signature.
  // Using SupabaseClient<Database> with one generic lets defaults resolve correctly.
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — middleware handles refresh
          }
        },
      },
    }
  );

  return client as unknown as SupabaseClient<Database>;
}
