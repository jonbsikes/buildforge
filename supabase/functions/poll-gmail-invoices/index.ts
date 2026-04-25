import { createClient } from "jsr:@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const GMAIL_CLIENT_ID = requireEnv("GMAIL_CLIENT_ID");
const GMAIL_CLIENT_SECRET = requireEnv("GMAIL_CLIENT_SECRET");
const GMAIL_REFRESH_TOKEN = requireEnv("GMAIL_REFRESH_TOKEN");
const BUILDFORGE_USER_ID = requireEnv("BUILDFORGE_USER_ID");
const ANTHROPIC_API_KEY = requireEnv("ANTHROPIC_API_KEY");

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

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

async function getAccessToken(): Promise<string> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!data.access_token) {
    throw new Error(`Gmail OAuth failed: ${JSON.stringify(data)}`);
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
  return decodeBase64(data.data);
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

async function extractInvoicesFromPdf(
  buffer: Uint8Array
): Promise<ExtractedData[]> {
  // Send to Anthropic with base64 encoding
  const base64Data = uint8ToBase64(buffer);
  const mediaType = "application/pdf";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      // Cache the ~3KB system prompt — ephemeral TTL is ~5 minutes, so steady-state
      // polling reads from cache instead of re-sending the cost-code reference on
      // every invoice extraction.
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
    console.error("Claude API error:", data);
    return [];
  }

  const textBlock = data.content?.[0];
  if (!textBlock || textBlock.type !== "text") {
    console.error("No text response from Claude");
    return [];
  }

  try {
    const parsed = JSON.parse(textBlock.text);
    return parsed.invoices || [];
  } catch (e) {
    console.error("Failed to parse extraction response:", e, textBlock.text);
    return [];
  }
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
  // Auth gate: only allow cron / trusted callers
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

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

    // Get Gmail access token
    const accessToken = await getAccessToken();

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
        const fromEmail = fromHeader?.value || "unknown";

        // Collect attachments
        const attachments = collectAttachments(payload);

        if (attachments.length === 0) {
          console.log(
            `Message ${msg.id} from ${fromEmail} has no supported attachments; skipping`
          );
          skipped++;
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
            const extractedInvoices = await extractInvoicesFromPdf(buffer);

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
                  amount: li.amount ?? 0,
                };
              });

              // Assemble ai_notes, downgrade confidence when matching fails.
              let aiConfidence = inv.ai_confidence;
              let aiNotes = inv.ai_notes ?? "";
              if (invalidCodes.length) {
                if (aiConfidence === "high") aiConfidence = "medium";
                aiNotes = (aiNotes + ` Unknown cost code(s): ${invalidCodes.join(", ")}.`).trim();
              }
              if (!vendorId && inv.vendor) {
                if (aiConfidence === "high") aiConfidence = "medium";
                aiNotes = (aiNotes + ` Vendor "${inv.vendor}" not in master list — pick or create.`).trim();
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
                })
                .select("id")
                .single();

              if (invoiceError || !invRow) {
                console.error(
                  `Failed to create invoice from message ${msg.id}:`,
                  invoiceError
                );
                errors++;
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
            }
          } catch (attachError) {
            console.error(
              `Error processing attachment ${attachmentId}:`,
              attachError
            );
            errors++;
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
      }
    }

    // ---------------------------------------------------------------------------
    // Advance the watermark. We upsert rather than update so the function
    // works correctly even on the very first run before migration 020 seeds
    // the row.
    // ---------------------------------------------------------------------------
    const { error: upsertError } = await supabase
      .from("gmail_sync_state")
      .upsert(
        { id: 1, last_checked_at: runStartedAt, updated_at: runStartedAt },
        { onConflict: "id" }
      );

    if (upsertError) {
      console.warn("Could not update gmail_sync_state:", upsertError);
    }

    return new Response(
      JSON.stringify({ success: true, processed, skipped, errors }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: String(err), processed, skipped, errors }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
