/**
 * vendors.trade stores a JSON-stringified array of trade names (sourced from
 * cost code descriptions). Older rows may hold a plain string. Always parse
 * through here before displaying — never render the raw column value.
 */
export function parseTrades(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === "string");
  } catch {
    // Legacy plain-string value — fall through
  }
  return [raw];
}
