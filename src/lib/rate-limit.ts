/**
 * Simple in-memory rate limiter for API routes.
 * Tracks requests per key (typically user ID) within a sliding window.
 */

const hits = new Map<string, number[]>();

/** Prune entries older than `windowMs` to prevent memory leaks. */
function prune(key: string, windowMs: number, now: number) {
  const timestamps = hits.get(key);
  if (!timestamps) return;
  const cutoff = now - windowMs;
  const fresh = timestamps.filter((t) => t > cutoff);
  if (fresh.length === 0) hits.delete(key);
  else hits.set(key, fresh);
}

/**
 * Returns `true` if the request should be allowed, `false` if rate-limited.
 * @param key      Unique identifier (e.g. user ID)
 * @param limit    Max requests per window
 * @param windowMs Window duration in milliseconds (default 60 000 = 1 minute)
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  prune(key, windowMs, now);

  const timestamps = hits.get(key) ?? [];
  if (timestamps.length >= limit) return false;

  timestamps.push(now);
  hits.set(key, timestamps);
  return true;
}
