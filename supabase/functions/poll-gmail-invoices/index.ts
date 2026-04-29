import { createClient } from "jsr:@supabase/supabase-js@2";
// Gmail API returns attachment bodies as base64URL (RFC 4648 §5: `-` and `_`
// instead of `+` and `/`). The standard `decodeBase64` rejects those chars,
// so attachments whose encoded form happens to include them fail with
// "Failed to decode base64". Use the URL-safe decoder.
import { decodeBase64Url } from "https://deno.land/std@0.224.0/encoding/base64url.ts";

// Read env at request time (not module load) so a missing variable produces a
// clean JSON error response instead of a Deno boot crash. A boot crash returns
// a plain-text 503 from the Supabase runtime, which the client surfaces as a
// generic "Failed to connect" — making it impossible to know which secret is
// missing without checking dashboard logs.
const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "BUILDFORGE_USER_ID",
  "ANTHROPIC_API_KEY",
] as const;

function loadEnv(): { ok: true; env: Record<(typeof REQUIRED_ENV)[number], string> } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const env: Record<string, string> = {};
  for (const name of REQUIRED_ENV) {
    const v = Deno.env.get(name);
    if (!v) missing.push(name);
    else env[name] = v;
  }
  if (missing.length) return { ok: false, missing };
  return { ok: true, env: env as Record<(typeof REQUIRED_ENV)[number], string> };
}

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

// CORS headers for browser-originated calls (from the AP page "Check Email"
// button). The Supabase runtime handles OPTIONS preflight on its own, but
// the actual POST response needs Access-Control-Allow-Origin or the browser
// will block it with net::ERR_FAILED — which surfaces to the user as
// "Network error: Failed to fetch".
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are an invoice data extraction assistant for a residential construction and land development company.

Extract ALL invoices from the provided document and return ONLY valid JSON — no markdown, no explanation.

A single document may contain one invoice or multiple invoices. Extract each one separately.

## Available Cost Codes

### Land Development (1–33)
1=Raw Land, 2=Closing Costs, 3=Survey, 4=Filing Fees, 5=Permitting Fees, 6=Taxes, 7=Legal, 8=Engineering, 9=Environmental Study/Phase 1, 10=Geotechnical/Soil Testing, 11=Site Clearing, 12=Earth Work, 13=Detention/Retention Pond, 14=Water, 15=Storm Sewer, 16=Sanitary Sewer, 17=Paving, 18=Flatwork, 19=Utilities-Electrical, 20=Utilities-Gas, 21=Utilities-Internet, 22=Fencing, 23=Signage, 24=Street Signs, 25=Monument Signs/Entry Features, 26=Postal Service Boxes, 27=Landscaping, 28=Irrigation, 29=Street Lights, 30=HOA Setup, 31=Marketing, 32=Sales/Model Home Costs, 33=Miscellaneous

### Home Construction (34–102)
34=Lot, 35=Closing Cost (Loan), 36=Loan Origination Fee, 37=Permits & Inspection Fees, 38=Pre-Construction Survey, 39=Foundation Survey, 40=Property Taxes, 41=Engineering/Plans, 42=Insurance-Builders Risk, 43=Site Prep/Tree Clearing, 44=Concrete-Foundation, 45=Grade-Rough, 46=Grade-Final, 47=Frame-Material, 48=Framing-Labor, 49=Roofing-Turn Key, 50=Insulation-Turn Key, 51=Siding-Labor, 52=Sheetrock-Materials, 53=Sheetrock-Labor, 54=Water Well System, 55=Brick-Material, 56=Brick-Sand, 57=Brick-Labor, 58=Fireplace/Masonry Features, 59=Garage Door-Rough, 60=Garage Door-Final, 61=Trim-Material, 62=Trim-Exterior Doors, 63=Trim-Interior Doors, 64=Windows, 65=Trim-Hardware, 66=Trim-Labor, 67=Cabinets-Material, 68=Cabinets-Labor, 69=Paint-Interior Turn Key, 70=Paint-Exterior Turn Key, 71=Countertops-Turn Key, 72=Flooring, 73=Tile, 74=Mirrors & Shower Glass, 75=Appliances, 76=Smart Home/Low Voltage, 77=HVAC-Rough, 78=HVAC-Final, 79=Electrical-Rough, 80=Electrical-Fixtures, 81=Electrical-Final, 82=Plumbing-Ground, 83=Plumbing-Top Out, 84=Plumbing-Final, 85=Septic System, 86=Concrete-Flatwork, 87=Landscaping, 88=Gutters & Downspouts, 89=Clean Up-Frame, 90=Clean Up-Sheetrock, 91=Clean Up-Brick, 92=Clean Up-Trim, 93=Clean Up-Paint & Tile, 94=Clean Up-Final (Construction), 95=Clean Up-Final (Move-In), 96=Operating-Portable Toilet, 97=Operating-Dumpsters, 98=Operating-Electrical Temporary, 99=Operating-Water Temporary, 100=Survey-Final/As-Built, 101=Warranty Reserve, 102=Miscellaneous

### General & Administrative (103–120)
103=Office Rent/Utilities, 104=Office Supplies, 105=Software & Subscriptions, 106=Phone & Internet, 107=Accounting & Bookkeeping, 108=Legal-General Business, 109=Bank Fees & Charges, 110=Interest Expense, 111=Payroll-Office Staff, 112=Payroll-Superintendent/Field, 113=Payroll Taxes & Benefits, 114=Vehicle & Equipment, 115=Fuel, 116=Tools & Small Equipment, 117=Continuing Education/Dues, 118=Advertising & Marketing-Company, 119=Travel & Entertainment, 120=Miscellaneous-G&A

## Rules
- cost_code must be a string number from the list above (e.g. "47", "82")
- If multiple trades appear on one invoice, create one line_item per trade/cost code
- Dates must be YYYY-MM-DD; if year is ambiguous use current year
- If due_date is not stated, set it to invoice_date + 30 days
- IMPORTANT: due_date must ALWAYS be at least 7 days after invoice_date. If the stated due_date is less than invoice_date + 7 days, override it to invoice_date + 7 days
- Amount values must be plain numbers (no $ signs or commas)
- ai_confidence: "high" = all key fields clearly readable; "medium" = some fields estimated; "low" = vendor, amount, or date unreadable/conflicting
- ai_notes: brief explanation if confidence is medium or low; empty string otherwise
- project_name_hint: if the invoice mentions a job site address, subdivision name, or project name, include it here; otherwise null

## Output format (return ONLY this JSON — always an array, even for a single invoice):
{
  "invoices": [
    {
      "vendor": "string",
      "invoice_number": "string",
      "invoice_date": "YYYY-MM-DD",
      "due_date": "YYYY-MM-DD",
      "total_amount": 0.00,
      "line_items": [
        { "cost_code": "string", "description": "string", "amount": 0.00 }
      ],
      "ai_confidence": "high" | "medium" | "low",
      "ai_notes": "string",
      "project_name_hint": "string | null"
    }
  ]
}`;

interface ExtractedData {
  vendor: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  line_items: { cost_code: string; description: string; amount: number }[];
  ai_confidence: "high" | "medium" | "low";
  ai_notes: string;
  project_name_hint: string | null;
}

/** Normalize a cost code string to the integer form used by the master list. */
function normalizeCostCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

interface GmailPart {
  partId?: string;
  mimeType: string;
  filename?: string;
  body: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
}

// ---------------------------------------------------------------------------
// Vendor matching helpers
// ---------------------------------------------------------------------------

/** Strip suffixes like LLC, Inc, Corp and normalize whitespace / casing */
function normalizeVendorName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,'"]/g, "")
    .replace(/\b(llc|inc|corp|corporation|incorporated|co|company|ltd|lp|llp|dba)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the best matching vendor from the in-memory list.
 * Match strategy (in order):
 *   1. Exact normalized match
 *   2. Token-overlap match — at least 2 shared normalized tokens AND a
 *      common substring of length ≥ 4. The previous bare-containment match
 *      was too greedy ("ABC" inside "Plumbing ABC Services" attributed to
 *      the wrong vendor; "Co" + entity-suffix stripping collapsed distinct
 *      vendors like "Co Plumbing" / "Co Electric").
 * Returns vendor id if matched, null otherwise (invoice flagged for review).
 */
function findVendor(
  extractedName: string,
  allVendors: { id: string; name: string }[],
): string | null {
  const normalized = normalizeVendorName(extractedName);
  if (!normalized) return null;

  // 1) Exact normalized match
  const exact = allVendors.find(
    (v) => normalizeVendorName(v.name) === normalized
  );
  if (exact) return exact.id;

  // 2) Token-overlap match
  const extractedTokens = new Set(normalized.split(" ").filter((t) => t.length >= 3));
  if (extractedTokens.size === 0) return null;

  let best: { id: string; overlap: number } | null = null;
  for (const v of allVendors) {
    const vNorm = normalizeVendorName(v.name);
    if (!vNorm) continue;
    const vTokens = vNorm.split(" ").filter((t) => t.length >= 3);
    let overlap = 0;
    for (const t of vTokens) if (extractedTokens.has(t)) overlap++;
    // Require ≥2 shared tokens to call it a match. Single-token overlap is too
    // permissive given how many vendors share generic words ("Construction",
    // "Services", "Supply", trade names).
    if (overlap < 2) continue;
    if (!best || overlap > best.overlap) best = { id: v.id, overlap };
  }

  return best?.id ?? null;
}

async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!data.access_token) {
    // Surface Google's error_description so the operator can tell the
    // difference between a revoked token, an invalid client, and a
    // network/quota issue.
    const detail = data?.error_description || data?.error || JSON.stringify(data).slice(0, 200);
    throw new Error(`Gmail OAuth failed: ${detail}`);
  }
  return data.access_token;
}

function collectAttachments(part: GmailPart, results: GmailPart[] = []): GmailPart[] {
  const supportedMimes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);

  if (part.body?.attachmentId && supportedMimes.has(part.mimeType)) {
    results.push(part);
  }

  if (part.parts) {
    part.parts.forEach((p) => collectAttachments(p, results));
  }

  return results;
}

async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Uint8Array> {
  const resp = await fetch(
    `${GMAIL_API}/users/me/messages/${messageId}/attachments/${attachmentId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await resp.json();
  if (!data.data) throw new Error("No attachment data");
  return decodeBase64Url(data.data);
}

// Chunked base64 encoder. The previous one-liner
// `btoa(String.fromCharCode(...buffer))` blows up for PDFs >65KB because the
// argument-count limit on `String.fromCharCode` is hit. Encode in 8KB chunks.
function uint8ToBase64(buffer: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < buffer.length; i += CHUNK) {
    const slice = buffer.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Extract invoices from a PDF buffer.
 *
 * Returns either the parsed list (possibly empty if the PDF genuinely has no
 * invoices) or a structured failure that the caller can surface as a
 * per-message diagnostic. Earlier versions returned `[]` for every failure
 * mode and `console.error`d the reason — that made it impossible to tell from
 * the response body whether Claude failed, the PDF was empty, or the JSON
 * was malformed.
 */
type ExtractionResult =
  | { ok: true; invoices: ExtractedData[] }
  | { ok: false; reason: string };

async function extractInvoicesFromPdf(
  buffer: Uint8Array,
  anthropicApiKey: string,
): Promise<ExtractionResult> {
  const base64Data = uint8ToBase64(buffer);
  const mediaType = "application/pdf";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: "text",
              text: "Extract all invoices from this document. Return ONLY valid JSON, no explanation.",
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const apiErr = data?.error?.message || JSON.stringify(data).slice(0, 200);
    console.error("Claude API error:", data);
    return { ok: false, reason: `Claude API ${response.status}: ${apiErr}` };
  }

  const textBlock = data.content?.[0];
  if (!textBlock || textBlock.type !== "text") {
    console.error("No text response from Claude");
    return { ok: false, reason: "Claude returned no text block (stop_reason=" + (data?.stop_reason ?? "unknown") + ")" };
  }

  // Claude sometimes wraps JSON output in ```json fences despite instructions.
  // Strip any fenced wrapper before parsing.
  let raw = String(textBlock.text).trim();
  const fenceMatch = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) raw = fenceMatch[1].trim();

  let parsed: { invoices?: ExtractedData[] };
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse extraction response:", e, raw);
    return {
      ok: false,
      reason: `JSON parse failed: ${(e as Error).message}. First 120 chars: ${raw.slice(0, 120)}`,
    };
  }

  return { ok: true, invoices: parsed.invoices ?? [] };
}

async function findProjectByHint(
  supabase: ReturnType<typeof createClient>,
  hint: string | null
): Promise<string | null> {
  if (!hint) return null;

  // Sanitize the Claude-extracted hint before interpolating into PostgREST's
  // .or() filter DSL. Commas and parentheses break the DSL parser; %/_ act as
  // ilike wildcards; backslashes and quotes can confuse the parser further.
  // Strip them all rather than escape them — losing a comma in a project hint
  // does no harm; a malformed query returns zero rows silently.
  const safe = hint.replace(/[,()%_\\"']/g, " ").trim();
  if (!safe) return null;

  const { data } = await supabase
    .from("projects")
    .select("id")
    .or(
      `name.ilike.%${safe}%,address.ilike.%${safe}%,subdivision.ilike.%${safe}%`
    )
    .limit(1);

  return data?.[0]?.id ?? null;
}

Deno.serve(async (req: Request) => {
  // CORS preflight — return immediately with allowed methods/headers.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // Validate env first — return a structured JSON error so the client can
  // display exactly which secret is missing rather than a generic
  // "Failed to connect" boot crash.
  const envResult = loadEnv();
  if (!envResult.ok) {
    return new Response(
      JSON.stringify({
        error: `Edge function misconfigured — missing env: ${envResult.missing.join(", ")}`,
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN,
    BUILDFORGE_USER_ID,
    ANTHROPIC_API_KEY,
  } = envResult.env;

  // Auth gate: only allow cron / trusted callers (or signed-in app users with
  // a valid Supabase session JWT — verified by Supabase Edge Runtime via the
  // Authorization header).
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
    }
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // Per-message diagnostic trail returned in the response body so the AP page
  // button can surface exactly why an email didn't come through. Without this,
  // operators only see aggregate counts and have to dig through dashboard logs
  // to find the reason for a skip or error.
  type MessageResult =
    | "processed"
    | "duplicate_message_id"
    | "no_supported_attachment"
    | "duplicate_invoice"
    | "extraction_empty"
    | "db_insert_failed"
    | "line_items_failed"
    | "storage_upload_failed"
    | "exception";
  const details: Array<{
    id: string;
    from?: string;
    subject?: string;
    result: MessageResult;
    reason?: string;
  }> = [];

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch vendors + cost codes for matching. Both are snapshots — fetched
    // once per run so every invoice in the batch is resolved against the same
    // reference data.
    const [{ data: vendors }, { data: costCodes }] = await Promise.all([
      supabase.from("vendors").select("id, name").eq("is_active", true),
      supabase.from("cost_codes").select("code"),
    ]);

    const vendorList = vendors ?? [];
    const validCodeSet = new Set(
      (costCodes ?? []).map((c) => String((c as { code: number | string }).code))
    );

    // Get Gmail access token. Catch separately so we can surface a clear
    // OAuth error (revoked refresh token, wrong client, etc.) instead of
    // letting it fall into the generic outer catch.
    let accessToken: string;
    try {
      accessToken = await getAccessToken(
        GMAIL_CLIENT_ID,
        GMAIL_CLIENT_SECRET,
        GMAIL_REFRESH_TOKEN,
      );
    } catch (oauthErr) {
      console.error("Gmail OAuth error:", oauthErr);
      return new Response(
        JSON.stringify({ error: String(oauthErr), processed, skipped, errors }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // ---------------------------------------------------------------------------
    // Incremental sync: read last-checked timestamp from gmail_sync_state.
    // This is the primary deduplication mechanism — we only ask Gmail for
    // messages received AFTER the last successful run, so old emails are never
    // re-fetched regardless of their read/unread state.
    // ---------------------------------------------------------------------------
    const { data: syncState } = await supabase
      .from("gmail_sync_state")
      .select("last_checked_at")
      .single();

    const lastCheckedAt = syncState?.last_checked_at
      ? new Date(syncState.last_checked_at)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // first run: last 7 days

    // Record when this run started so we can save it as the new watermark.
    // Using run-start (not run-end) ensures messages that arrive during
    // processing are captured by the next run.
    const runStartedAt = new Date().toISOString();
    const afterEpoch = Math.floor(lastCheckedAt.getTime() / 1000);

    // Query only messages with attachments received after the last check.
    // `has:attachment` pre-filters server-side so we don't fetch full message
    // details for emails that can never contain invoices.
    const q = encodeURIComponent(`after:${afterEpoch} has:attachment`);
    const listResp = await fetch(
      `${GMAIL_API}/users/me/messages?q=${q}&maxResults=100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const listData = await listResp.json();
    const messages = listData.messages || [];

    console.log(`Found ${messages.length} messages since ${lastCheckedAt.toISOString()}`);

    for (const msg of messages) {
      let msgFrom: string | undefined;
      let msgSubject: string | undefined;
      try {
        // ---------------------------------------------------------------------------
        // Secondary dedup guard: skip if we already have an invoice from this
        // Gmail message ID. This catches edge cases where the same message falls
        // in the query window twice (e.g., if last_checked_at wasn't updated due
        // to a previous crash) and ensures idempotency.
        // ---------------------------------------------------------------------------
        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("email_message_id", msg.id)
          .limit(1);

        if (existing?.length) {
          console.log(`Message ${msg.id} already processed; skipping`);
          skipped++;
          details.push({ id: msg.id, result: "duplicate_message_id" });
          continue;
        }

        // Fetch full message
        const msgResp = await fetch(
          `${GMAIL_API}/users/me/messages/${msg.id}?format=full`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        const msgData = await msgResp.json();

        const payload = msgData.payload || {};
        const headers = payload.headers || [];
        const fromHeader = headers.find((h: { name: string }) => h.name === "From");
        const subjectHeader = headers.find((h: { name: string }) => h.name === "Subject");
        const fromEmail = fromHeader?.value || "unknown";
        msgFrom = fromEmail;
        msgSubject = subjectHeader?.value;

        // Collect attachments
        const attachments = collectAttachments(payload);

        if (attachments.length === 0) {
          // Surface the MIME types we DID see — most "no attachments" cases are
          // actually inline images, calendar invites, or unsupported types like
          // .docx. Without this, the user gets a generic skip with no clue why.
          const sawMimes = new Set<string>();
          const collectMimes = (p: GmailPart) => {
            if (p.mimeType) sawMimes.add(p.mimeType);
            if (p.parts) p.parts.forEach(collectMimes);
          };
          collectMimes(payload);
          const mimeList = Array.from(sawMimes).join(", ") || "none";
          console.log(
            `Message ${msg.id} from ${fromEmail} has no supported attachments; skipping (saw: ${mimeList})`
          );
          skipped++;
          details.push({
            id: msg.id,
            from: fromEmail,
            subject: msgSubject,
            result: "no_supported_attachment",
            reason: `MIME types seen: ${mimeList}`,
          });
          continue;
        }

        // Process each attachment
        for (const attachment of attachments) {
          const attachmentId = attachment.body.attachmentId;
          if (!attachmentId) continue;

          try {
            const buffer = await downloadAttachment(
              accessToken,
              msg.id,
              attachmentId
            );

            // Extract invoices
            const extractionResult = await extractInvoicesFromPdf(buffer, ANTHROPIC_API_KEY);

            if (!extractionResult.ok) {
              errors++;
              details.push({
                id: msg.id,
                from: msgFrom,
                subject: msgSubject,
                result: "extraction_empty",
                reason: `${attachment.filename || "attachment"}: ${extractionResult.reason}`,
              });
              continue;
            }

            const extractedInvoices = extractionResult.invoices;
            if (extractedInvoices.length === 0) {
              // Claude succeeded but found no invoices — likely a non-invoice
              // attachment (statement, payment receipt, marketing). Surface so
              // the user knows to drag-drop manually if needed.
              errors++;
              details.push({
                id: msg.id,
                from: msgFrom,
                subject: msgSubject,
                result: "extraction_empty",
                reason: `Claude found no invoices in ${attachment.filename || "attachment"} — may not be an invoice`,
              });
              continue;
            }

            for (const inv of extractedInvoices) {
              // Find project
              const projectId = await findProjectByHint(supabase, inv.project_name_hint);

              // Find vendor
              const vendorId = findVendor(inv.vendor, vendorList);

              // Composite-key dedup: even if this Gmail message hasn't been
              // seen before, the same invoice can arrive twice (resend,
              // forwarded thread, attachment on a new reply). Skip if we
              // already have a row with the same vendor_id (or vendor name
              // when vendor_id is null) + invoice_number + amount.
              if (inv.invoice_number && inv.total_amount) {
                const dupQuery = supabase
                  .from("invoices")
                  .select("id")
                  .eq("invoice_number", inv.invoice_number)
                  .eq("amount", inv.total_amount)
                  .limit(1);
                if (vendorId) {
                  dupQuery.eq("vendor_id", vendorId);
                } else if (inv.vendor) {
                  dupQuery.ilike("vendor", inv.vendor);
                }
                const { data: compositeDup } = await dupQuery;
                if (compositeDup?.length) {
                  console.log(
                    `Skipping ${inv.vendor} #${inv.invoice_number} ($${inv.total_amount}): already in system`
                  );
                  skipped++;
                  details.push({
                    id: msg.id,
                    from: msgFrom,
                    subject: msgSubject,
                    result: "duplicate_invoice",
                    reason: `${inv.vendor} #${inv.invoice_number} ($${inv.total_amount}) already in system`,
                  });
                  continue;
                }
              }

              // Validate cost codes against master list. Codes we can't resolve
              // are nulled out so the reviewer sees a blank in the UI (instead
              // of silently carrying an AI-invented code through to save).
              const invalidCodes: string[] = [];
              const validatedLines = (inv.line_items ?? []).map((li) => {
                const norm = normalizeCostCode(li.cost_code);
                const valid = norm !== null && validCodeSet.has(norm);
                if (!valid) {
                  invalidCodes.push(
                    (li.cost_code ?? "").toString().trim() || "(blank)"
                  );
                }
                return {
                  cost_code: valid ? norm : null,
                  description: li.description ?? "",
                  amount: Number(li.amount) || 0,
                };
              });

              // Strict gate: an invoice cannot be silently approved unless we
              // have all three of vendor (matched to the master list), every
              // line item resolved to a valid cost code, and a positive amount.
              // Any miss flips the row to LOW confidence so the AP page shows
              // a "Needs attention" badge and approval is blocked until the
              // user fixes it via the dropdowns on the edit form.
              const totalAmount = Number(inv.total_amount) || 0;
              const hasAmount = totalAmount > 0;
              const allLinesHaveCode = validatedLines.length > 0 && validatedLines.every((l) => l.cost_code !== null);
              const hasVendor = !!vendorId;
              const needsAttention = !hasVendor || !allLinesHaveCode || !hasAmount;

              let aiConfidence = inv.ai_confidence;
              let aiNotes = inv.ai_notes ?? "";
              if (invalidCodes.length) {
                aiNotes = (aiNotes + ` Unknown cost code(s): ${invalidCodes.join(", ")}.`).trim();
              }
              if (!vendorId && inv.vendor) {
                aiNotes = (aiNotes + ` Vendor "${inv.vendor}" not in master list — pick or create.`).trim();
              }
              if (!hasAmount) {
                aiNotes = (aiNotes + ` Amount missing or zero — verify.`).trim();
              }
              if (!validatedLines.length) {
                aiNotes = (aiNotes + ` No line items extracted — add at least one.`).trim();
              }
              if (needsAttention) {
                // Force low so the existing low-conf gate on approveInvoice and
                // the AP page banner both flag this row consistently.
                aiConfidence = "low";
              }

              const displayName = `${inv.vendor} – ${inv.invoice_number}`;

              // Insert the invoice row FIRST without file_path. If the insert
              // fails we never touch storage. The live `invoices` table has no
              // `vendor_name` / `file_name_original` / `created_by` / `line_items`
              // columns — the canonical column names are `vendor`, `file_name`,
              // `user_id`, and line items live in the separate `invoice_line_items`
              // table (see CLAUDE.md schema).
              const { data: invRow, error: invoiceError } = await supabase
                .from("invoices")
                .insert({
                  project_id: projectId,
                  vendor_id: vendorId,
                  vendor: inv.vendor,
                  invoice_number: inv.invoice_number,
                  invoice_date: inv.invoice_date,
                  due_date: inv.due_date,
                  amount: inv.total_amount,
                  total_amount: inv.total_amount,
                  ai_confidence: aiConfidence,
                  ai_notes: aiNotes,
                  status: "pending_review",
                  source: "email",
                  file_name: displayName,
                  email_message_id: msg.id,
                  user_id: BUILDFORGE_USER_ID,
                  manually_reviewed: false,
                })
                .select("id")
                .single();

              if (invoiceError || !invRow) {
                console.error(
                  `Failed to create invoice from message ${msg.id}:`,
                  invoiceError
                );
                errors++;
                details.push({
                  id: msg.id,
                  from: msgFrom,
                  subject: msgSubject,
                  result: "db_insert_failed",
                  reason: invoiceError?.message ?? "unknown DB error",
                });
                continue;
              }

              // Insert line items into the dedicated table. If this fails, roll
              // back the invoice row so we don't leave a header with no lines —
              // downstream job-cost rollups read from invoice_line_items.
              if (validatedLines.length) {
                const lineRows = validatedLines.map((li) => ({
                  invoice_id: invRow.id,
                  project_id: projectId,
                  cost_code: li.cost_code,
                  description: li.description,
                  amount: li.amount,
                }));

                const { error: liErr } = await supabase
                  .from("invoice_line_items")
                  .insert(lineRows);

                if (liErr) {
                  console.error(
                    `Failed to insert line items for invoice ${invRow.id}:`,
                    liErr
                  );
                  await supabase.from("invoices").delete().eq("id", invRow.id);
                  errors++;
                  details.push({
                    id: msg.id,
                    from: msgFrom,
                    subject: msgSubject,
                    result: "line_items_failed",
                    reason: liErr.message,
                  });
                  continue;
                }
              }

              // Now upload the attachment to storage and stamp the path on
              // the invoice. If the upload fails we delete the invoice row +
              // line items so we don't leave a record pointing at no file.
              const safeName = (
                attachment.filename || `invoice_${Date.now()}`
              ).replace(/[^a-zA-Z0-9._-]/g, "_");
              const filePath = `${BUILDFORGE_USER_ID}/${Date.now()}-${safeName}`;

              const { data: uploadData, error: uploadErr } = await supabase.storage
                .from("invoices")
                .upload(filePath, buffer, {
                  contentType: attachment.mimeType,
                });

              if (uploadErr || !uploadData) {
                console.error(
                  `Failed to upload attachment for invoice ${invRow.id}:`,
                  uploadErr
                );
                // Roll back invoice + line items (CASCADE on FK handles the latter
                // if defined; otherwise delete explicitly).
                await supabase.from("invoice_line_items").delete().eq("invoice_id", invRow.id);
                await supabase.from("invoices").delete().eq("id", invRow.id);
                errors++;
                details.push({
                  id: msg.id,
                  from: msgFrom,
                  subject: msgSubject,
                  result: "storage_upload_failed",
                  reason: uploadErr?.message ?? "unknown storage error",
                });
                continue;
              }

              const { error: pathErr } = await supabase
                .from("invoices")
                .update({ file_path: uploadData.path })
                .eq("id", invRow.id);

              if (pathErr) {
                console.error(
                  `Failed to stamp file_path on invoice ${invRow.id}:`,
                  pathErr
                );
                // Best-effort: remove the orphan storage object; invoice keeps no path.
                await supabase.storage.from("invoices").remove([uploadData.path]);
              }

              console.log(
                `Created invoice ${inv.invoice_number} from ${inv.vendor}`
              );
              processed++;
              details.push({
                id: msg.id,
                from: msgFrom,
                subject: msgSubject,
                result: "processed",
                reason: `${inv.vendor} #${inv.invoice_number} ($${inv.total_amount})`,
              });
            }
          } catch (attachError) {
            console.error(
              `Error processing attachment ${attachmentId}:`,
              attachError
            );
            errors++;
            details.push({
              id: msg.id,
              from: msgFrom,
              subject: msgSubject,
              result: "exception",
              reason: (attachError as Error)?.message ?? String(attachError),
            });
          }
        }

        // Mark message as read for inbox cleanliness. Non-blocking — a failure
        // here doesn't affect deduplication since we now rely on timestamps.
        void fetch(`${GMAIL_API}/users/me/messages/${msg.id}/modify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
        }).catch((e) => console.warn(`Failed to mark message ${msg.id} as read:`, e));

      } catch (msgError) {
        console.error(`Error processing message ${msg.id}:`, msgError);
        errors++;
        details.push({
          id: msg.id,
          from: msgFrom,
          subject: msgSubject,
          result: "exception",
          reason: (msgError as Error)?.message ?? String(msgError),
        });
      }
    }

    // ---------------------------------------------------------------------------
    // Advance the watermark — but ONLY if every message in the window was
    // accounted for cleanly. If anything errored (DB insert, storage, AI
    // extraction), leave the watermark put so the failed messages stay
    // visible in the next window for retry. The email_message_id dedup guard
    // above prevents successfully-processed messages from being re-ingested.
    //
    // Without this guard, an errored message is permanently lost — the
    // watermark advances past its received date and Gmail's `after:` filter
    // excludes it from every future run.
    // ---------------------------------------------------------------------------
    let watermarkAdvanced = false;
    if (errors === 0) {
      const { error: upsertError } = await supabase
        .from("gmail_sync_state")
        .upsert(
          { id: 1, last_checked_at: runStartedAt, updated_at: runStartedAt },
          { onConflict: "id" }
        );

      if (upsertError) {
        console.warn("Could not update gmail_sync_state:", upsertError);
      } else {
        watermarkAdvanced = true;
      }
    } else {
      console.log(
        `Watermark NOT advanced — ${errors} error(s) in this run; failed messages will be retried next run`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        skipped,
        errors,
        watermarkAdvanced,
        messagesScanned: messages.length,
        details,
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: String(err), processed, skipped, errors, details }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  }
});
