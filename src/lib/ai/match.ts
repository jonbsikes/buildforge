/**
 * Shared vendor + cost-code matching helpers used by both the manual-upload
 * extract route and the Gmail Edge Function. Keeping them in one place ensures
 * both ingestion paths resolve AI-extracted strings to real vendors/cost codes
 * using the same algorithm, so a string that matches in one path matches in
 * the other.
 *
 * Keep this module free of Next/Deno-specific imports so it can be bundled
 * into either runtime.
 */

export interface VendorCandidate {
  id: string;
  name: string;
}

/** Strip suffixes like LLC, Inc, Corp and normalize whitespace / casing */
export function normalizeVendorName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,'"]/g, "")
    .replace(
      /\b(llc|inc|corp|corporation|incorporated|co|company|ltd|lp|llp|dba)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the best matching vendor from the in-memory list.
 * Match strategy (in order):
 *   1. Exact normalized match
 *   2. Token-overlap match — at least 2 shared normalized tokens of length ≥ 3.
 *      Single-token overlap is too permissive given how many vendors share
 *      generic words ("Construction", "Services", "Supply", trade names).
 *      Bare containment ("ABC" inside "Plumbing ABC Services") is also too
 *      greedy and collapses distinct vendors like "Co Plumbing" / "Co Electric"
 *      once entity suffixes are stripped.
 * Returns vendor id if matched, null otherwise (invoice flagged for review).
 */
export function findVendorId(
  extractedName: string | null | undefined,
  allVendors: VendorCandidate[]
): string | null {
  if (!extractedName) return null;
  const normalized = normalizeVendorName(extractedName);
  if (!normalized) return null;

  const exact = allVendors.find(
    (v) => normalizeVendorName(v.name) === normalized
  );
  if (exact) return exact.id;

  const extractedTokens = new Set(
    normalized.split(" ").filter((t) => t.length >= 3)
  );
  if (extractedTokens.size === 0) return null;

  let best: { id: string; overlap: number } | null = null;
  for (const v of allVendors) {
    const vNorm = normalizeVendorName(v.name);
    if (!vNorm) continue;
    const vTokens = vNorm.split(" ").filter((t) => t.length >= 3);
    let overlap = 0;
    for (const t of vTokens) if (extractedTokens.has(t)) overlap++;
    if (overlap < 2) continue;
    if (!best || overlap > best.overlap) best = { id: v.id, overlap };
  }

  return best?.id ?? null;
}

/**
 * Normalize an AI-extracted cost code to the bare integer string used by the
 * cost_codes master list ("47", "82"). Returns null if the input doesn't
 * parse as a positive integer — callers should treat null as "invalid".
 */
export function normalizeCostCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

/**
 * Given a set of extracted cost-code strings and a set of valid codes (from
 * the cost_codes master table), return which extracted codes are invalid.
 * Used to downgrade ai_confidence and to surface a reviewer-facing warning.
 */
export function findInvalidCostCodes(
  extracted: (string | null | undefined)[],
  validCodes: Set<string>
): string[] {
  const invalid = new Set<string>();
  for (const raw of extracted) {
    const norm = normalizeCostCode(raw);
    if (!norm) {
      // Preserve the original extracted value in the error so the reviewer
      // can see what the AI produced (e.g. blank, "n/a", "47-material").
      invalid.add(String(raw ?? "").trim() || "(blank)");
      continue;
    }
    if (!validCodes.has(norm)) invalid.add(norm);
  }
  return [...invalid];
}
