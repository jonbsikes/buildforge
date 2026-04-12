import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const GMAIL_REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN")!;
const BUILDFORGE_USER_ID = Deno.env.get("BUILDFORGE_USER_ID")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

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
 *   2. One name contains the other (catches "ABC Concrete" vs "ABC Concrete LLC")
 * Returns vendor id if matched, null if no match found (invoice will be flagged for review).
 */
function findVendor(
  extractedName: string,
  allVendors: { id: string; name: string }[],
): string | null {
  const normalized = normalizeVendorName(extractedName);

  // 1) Exact normalized match
  let best = allVendors.find(
    (v) => normalizeVendorName(v.name) === normalized
  );

  // 2) Containment match — one name contains the other
  if (!best) {
    best = allVendors.find((v) => {
      const vNorm = normalizeVendorName(v.name);
      return vNorm.includes(normalized) || normalized.includes(vNorm);
    });
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

async function extractInvoicesFromPdf(
  buffer: Uint8Array
): Promise<ExtractedData[]> {
  if (!ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not set; skipping invoice extraction");
    return [];
  }

  // Send to Anthropic with base64 encoding
  const base64Data = btoa(String.fromCharCode(...buffer));
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
      system: SYSTEM_PROMPT,
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

  const { data } = await supabase
    .from("projects")
    .select("id")
    .or(
      `name.ilike.%${hint}%,address.ilike.%${hint}%,subdivision.ilike.%${hint}%`
    )
    .limit(1);

  return data?.[0]?.id ?? null;
}

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch vendors for matching
    const { data: vendors } = await supabase
      .from("vendors")
      .select("id, name")
      .eq("is_active", true);

    const vendorList = vendors ?? [];

    // Get Gmail access token
    const accessToken = await getAccessToken();

    // Query for unread messages (use labelIds for efficiency)
    const listResp = await fetch(
      `${GMAIL_API}/users/me/messages?q=is:unread from:*&maxResults=100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    const listData = await listResp.json();
    const messages = listData.messages || [];

    console.log(`Found ${messages.length} unread messages`);

    for (const msg of messages) {
      try {
        // Check if we've already processed this message
        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("email_message_id", msg.id)
          .limit(1);

        if (existing?.length) {
          console.log(`Message ${msg.id} already processed; skipping`);
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
        const subjectHeader = headers.find(
          (h: { name: string }) => h.name === "Subject"
        );

        const fromEmail = fromHeader?.value || "unknown";
        const subject = subjectHeader?.value || "";

        // Collect attachments
        const attachments = collectAttachments(payload);

        if (attachments.length === 0) {
          console.log(
            `Message ${msg.id} from ${fromEmail} has no attachments; marking as read and skipping`
          );

          // Mark as read
          await fetch(
            `${GMAIL_API}/users/me/messages/${msg.id}/modify`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({
                removeLabelIds: ["UNREAD"],
              }),
            }
          );
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

              // Store file
              const safeName = (
                attachment.filename || `invoice_${Date.now()}`
              ).replace(/[^a-zA-Z0-9._-]/g, "_");
              const filePath = `${BUILDFORGE_USER_ID}/${Date.now()}-${safeName}`;

              const { data: uploadData } = await supabase.storage
                .from("invoices")
                .upload(filePath, buffer, {
                  contentType: attachment.mimeType,
                });

              const fileName = `${inv.vendor} – ${inv.invoice_number}`;

              // Create line items
              const lineItems = inv.line_items.map((li) => ({
                cost_code: li.cost_code,
                description: li.description,
                amount: li.amount,
              }));

              // Create invoice record
              const { error: invoiceError } = await supabase
                .from("invoices")
                .insert({
                  project_id: projectId,
                  vendor_id: vendorId,
                  vendor_name: inv.vendor,
                  invoice_number: inv.invoice_number,
                  invoice_date: inv.invoice_date,
                  due_date: inv.due_date,
                  amount: inv.total_amount,
                  ai_confidence: inv.ai_confidence,
                  ai_notes: inv.ai_notes,
                  status: "pending_review",
                  source: "email",
                  file_path: uploadData?.path,
                  file_name_original: attachment.filename,
                  email_message_id: msg.id,
                  created_by: BUILDFORGE_USER_ID,
                  line_items: lineItems,
                });

              if (invoiceError) {
                console.error(
                  `Failed to create invoice from message ${msg.id}:`,
                  invoiceError
                );
              } else {
                console.log(
                  `Created invoice ${inv.invoice_number} from ${inv.vendor}`
                );
              }
            }
          } catch (attachError) {
            console.error(
              `Error processing attachment ${attachmentId}:`,
              attachError
            );
          }
        }

        // Mark message as read after processing
        await fetch(
          `${GMAIL_API}/users/me/messages/${msg.id}/modify`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              removeLabelIds: ["UNREAD"],
            }),
          }
        );
      } catch (msgError) {
        console.error(`Error processing message ${msg.id}:`, msgError);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        