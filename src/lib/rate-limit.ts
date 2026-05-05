/**
 * Rate limiter backed by Supabase (works in serverless environments like Vercel).
 * Tracks requests per key (typically user ID) within a sliding window using the
 * `rate_limit_entries` table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns `true` if the request should be allowed, `false` if rate-limited.
 * @param supabase  Authenticated Supabase client
 * @param key       Unique identifier (e.g. user ID)
 * @param limit     Max requests per window
 * @param windowMs  Window duration in milliseconds (default 60 000 = 1 minute)
 */
export async function rateLimit(
  supabase: SupabaseClient,
  key: string,
  limit: number,
  windowMs = 60_000
): Promise<boolean> {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Cast to any — table not in generated types yet
  const db = supabase as any;

  // 1. Clean old entries for this key
  await db
    .from("rate_limit_entries")
    .delete()
    .eq("key", key)
    .lt("timestamp", cutoff);

  // 2. Count recent entries
  const { count } = await db
    .from("rate_limit_entries")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .gte("timestamp", cutoff);

  if ((count ?? 0) >= limit) {
    return false;
  }

  // 3. Insert new entry
  await db
    .from("rate_limit_entries")
    .insert({ key, timestamp: now });

  return true;
}
