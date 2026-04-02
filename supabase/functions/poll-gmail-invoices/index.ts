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

  if (part.filename && part.filename.length > 0 && supportedMimes.has(part.mimeType)) {
    results.push(part);
  }
  if (part.parts) {
    for (const child of part.parts) {
      collectAttachments(child, results);
    }
  }
  return results;
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mimeType] ?? "bin";
}

// Returns ALL invoices found in the document (1 or more)
async function extractWithClaude(base64Data: string, mimeType: string): Promise<ExtractedData[]> {
  const isImage = mimeType.startsWith("image/");

  const contentBlock = isImage
    ? {
        type: "image",
        source: { type: "base64", media_type: mimeType, data: base64Data },
      }
    : {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64Data },
      };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
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
            contentBlock,
            { type: "text", text: "Extract all invoices from this document and return the JSON as specified." },
          ],
        },
      ],
    }),
  });

  const result = await resp.json();
  if (!resp.ok) throw new Error(`Claude API error: ${JSON.stringify(result)}`);

  const text = result.content?.[0]?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: { invoices: ExtractedData[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Claude response: ${cleaned.slice(0, 200)}`);
  }

  const invoices = parsed.invoices ?? [];

  // Flag any invoice where key fields are missing
  for (const inv of invoices) {
    if (!inv.vendor || !inv.total_amount) {
      inv.ai_confidence = "low";
      inv.ai_notes = ((inv.ai_notes ?? "") + " Key fields missing or unreadable.").trim();
    }
  }

  return invoices;
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const accessToken = await getAccessToken();

    // Fetch messages from last 30 minutes with PDF or image attachments
    const query =
      "has:attachment newer_than:30m (filename:pdf OR filename:jpg OR filename:jpeg OR filename:png OR filename:webp)";

    const listResp = await fetch(
      `${GMAIL_API}/users/me/messages?q=${encodeURIComponent(query)}&maxResults=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listResp.json();
    const messages: { id: string }[] = listData.messages ?? [];

    const stats: { processed: number; skipped: number; errors: number; errorDetails: string[] } = {
      processed: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [],
    };

    // Fetch projects once for the whole run
    const { data: allProjects } = await supabase
      .from("projects")
      .select("id, name, address")
      .eq("user_id", BUILDFORGE_USER_ID);

    for (const { id: messageId } of messages) {
      // Fetch full message
      const msgResp = await fetch(
        `${GMAIL_API}/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msg = await msgResp.json();

      const attachments = collectAttachments(msg.payload ?? {});
      if (attachments.length === 0) {
        stats.skipped++;
        continue;
      }

      // Process each attachment — one Claude call per file, may yield multiple invoices
      for (let attIdx = 0; attIdx < attachments.length; attIdx++) {
        const attachment = attachments[attIdx];
        const mimeType = attachment.mimeType;

        // Fetch attachment bytes
        let rawBase64: string;
        if (attachment.body.data) {
          rawBase64 = attachment.body.data;
        } else if (attachment.body.attachmentId) {
          const attResp = await fetch(
            `${GMAIL_API}/users/me/messages/${messageId}/attachments/${attachment.body.attachmentId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const attData = await attResp.json();
          rawBase64 = attData.data;
        } else {
          stats.skipped++;
          continue;
        }

        // Gmail uses base64url — convert to standard base64 for decoding
        const base64 = rawBase64.replace(/-/g, "+").replace(/_/g, "/");

        // Decode and store in Supabase storage
        const ext = mimeToExt(mimeType);
        const storagePath = `${BUILDFORGE_USER_ID}/email/${messageId}/${attIdx}.${ext}`;

        let fileBytes: Uint8Array;
        try {
          fileBytes = decodeBase64(base64);
        } catch (err) {
          stats.errors++;
          stats.errorDetails.push(`[${messageId}_${attIdx}] base64 decode failed: ${err}`);
          continue;
        }

        const { error: uploadError } = await supabase.storage
          .from("invoices")
          .upload(storagePath, fileBytes, { contentType: mimeType, upsert: false });

        if (uploadError && !uploadError.message.toLowerCase().includes("already exists") && !uploadError.message.toLowerCase().includes("duplicate")) {
          stats.errors++;
          stats.errorDetails.push(`[${messageId}_${attIdx}] storage upload failed: ${uploadError.message}`);
          continue;
        }

        // Extract all invoices from this attachment
        let extractedList: ExtractedData[];
        try {
          extractedList = await extractWithClaude(base64, mimeType);
        } catch (err) {
          stats.errors++;
          stats.errorDetails.push(`[${messageId}_${attIdx}] claude extraction failed (mime=${mimeType}): ${err}`);
          continue;
        }

        if (extractedList.length === 0) {
          stats.skipped++;
          continue;
        }

        // Insert one invoice record per extracted invoice
        for (let invoiceIdx = 0; invoiceIdx < extractedList.length; invoiceIdx++) {
          const extracted = extractedList[invoiceIdx];
          // email_message_id: messageId_attachmentIndex_invoiceIndex
          const invoiceEmailId = `${messageId}_${attIdx}_${invoiceIdx}`;

          // Per-invoice dedup by email_message_id
          const { data: existingByEmailId } = await supabase
            .from("invoices")
            .select("id")
            .eq("email_message_id", invoiceEmailId)
            .maybeSingle();

          if (existingByEmailId) {
            stats.skipped++;
            continue;
          }

          // Dedup by vendor + invoice_number
          if (extracted.vendor && extracted.invoice_number) {
            const { data: dupByNumber } = await supabase
              .from("invoices")
              .select("id")
              .eq("vendor", extracted.vendor)
              .eq("invoice_number", extracted.invoice_number)
              .maybeSingle();

            if (dupByNumber) {
              stats.skipped++;
              continue;
            }
          }

          // Match project from hint
          let projectId: string | null = null;
          if (extracted.project_name_hint && allProjects) {
            const hint = extracted.project_name_hint.toLowerCase();
            const match = allProjects.find((p) => {
              const name = p.name.toLowerCase();
              const addr = (p.address ?? "").toLowerCase();
              return name.includes(hint) || hint.includes(name) || addr.includes(hint);
            });
            projectId = match?.id ?? null;
          }

          const dominant = extracted.line_items?.[0] ?? null;
          let costCodeId: string | null = null;
          if (dominant?.cost_code) {
            const { data: cc } = await supabase
              .from("cost_codes")
              .select("id")
              .eq("code", dominant.cost_code)
              .is("user_id", null)
              .maybeSingle();
            costCodeId = cc?.id ?? null;
          }

          const projectName = allProjects?.find((p) => p.id === projectId)?.name ?? "Company";
          const vendorDisplay = extracted.vendor?.trim() || "Unknown Vendor";
          const totalAmount =
            extracted.total_amount ??
            (extracted.line_items ?? []).reduce((s, li) => s + (li.amount ?? 0), 0);

          const displayName = [
            vendorDisplay,
            dominant?.cost_code ?? "—",
            projectName,
            extracted.invoice_number || "—",
          ].join(" – ");

          const { data: invoice, error: insertErr } = await supabase
            .from("invoices")
            .insert({
              user_id: BUILDFORGE_USER_ID,
              project_id: projectId,
              vendor: vendorDisplay,
              invoice_number: extracted.invoice_number || null,
              invoice_date: extracted.invoice_date || null,
              due_date: extracted.due_date || null,
              amount: totalAmount,
              total_amount: totalAmount,
              status: "pending_review",
              source: "email",
              ai_confidence: extracted.ai_confidence,
              ai_notes: extracted.ai_notes || null,
              file_path: storagePath,
              file_name: displayName,
              cost_code_id: costCodeId,
              email_message_id: invoiceEmailId,
              pending_draw: false,
              manually_reviewed: false,
            })
            .select("id")
            .single();

          if (insertErr || !invoice) {
            stats.errors++;
            stats.errorDetails.push(`[${invoiceEmailId}] invoice insert failed: ${insertErr?.message}`);
            continue;
          }

          if ((extracted.line_items ?? []).length > 0) {
            await supabase.from("invoice_line_items").insert(
              extracted.line_items.map((li) => ({
                invoice_id: invoice.id,
                cost_code: li.cost_code,
                description: li.description || null,
                amount: li.amount,
              }))
            );
          }

          if (extracted.ai_confidence === "low") {
            await supabase.from("notifications").insert({
              user_id: BUILDFORGE_USER_ID,
              type: "invoice_review",
              message: `Email invoice from ${vendorDisplay} (${
                extracted.invoice_number || "no #"
              }) needs manual review — AI confidence is low.`,
              reference_id: invoice.id,
              reference_type: "invoice",
              is_read: false,
            });
          }

          stats.processed++;
        }
      }
    }

    return new Response(JSON.stringify(stats), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("poll-gmail-invoices error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
