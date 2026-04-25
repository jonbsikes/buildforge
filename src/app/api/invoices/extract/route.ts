import { NextRequest, NextResponse } from "next/server";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { createClient } from "@/lib/supabase/server";
import { extractStructured } from "@/lib/ai/extract";
import { findVendorId, normalizeCostCode } from "@/lib/ai/match";

const SYSTEM_PROMPT = `You are an invoice data extraction assistant for a residential construction and land development company.

Extract structured data from the provided invoice PDF and return ONLY valid JSON — no markdown, no explanation.

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
- If only one trade, one line_item with the full amount
- Dates must be YYYY-MM-DD format; if year is ambiguous use current year
- If the invoice shows "terms", "payment terms", "net", or similar followed by a number (e.g. "Net 30", "Terms: 45", "Payment Terms: 60"), set due_date = invoice_date + that number of days
- If due_date is not stated and no payment terms found, set it to invoice_date + 30 days
- IMPORTANT: due_date must ALWAYS be at least 7 days after invoice_date. If the calculated or stated due_date is less than invoice_date + 7 days, override it to invoice_date + 7 days
- All amount values must be plain numbers (no $ signs, no commas)
- ai_confidence: "high" = all key fields clearly readable; "medium" = some fields estimated/unclear; "low" = vendor, amount, or date unreadable/conflicting
- ai_notes: brief explanation only if confidence is medium or low; empty string otherwise

## Project matching (only when a projects list is provided)
- A JSON array of projects will be appended to the user message with fields: id, name, type, address, subdivision, block, lot
- You MUST attempt to match every invoice to a project — do not give up easily
- Construction invoices almost always have a job site address — scan every address block on the invoice: "Ship To", "Deliver To", "Delivery Address", "Job Site", "Project Address", "Location", "Install At", "Work Location", or any secondary address that differs from the vendor's own address
- Match any of those addresses against the project address field (partial street number + street name match is sufficient)
- Also search for: subdivision name, lot number, block number, project name, or PO number referencing a job
- If multiple projects could match, PREFER home_construction type over land_development
- Set "project_id" to the matching project's id
- Only set project_id to null if the invoice is clearly for office/admin/overhead, OR if no address or job site reference of any kind appears on the invoice

## Multiple invoices in one PDF
- If the PDF contains multiple SEPARATE invoices (each with a distinct invoice number, or clearly separate billing sections with their own totals), extract EACH as a separate object in the "invoices" array
- If the PDF shows work at multiple job sites but has ONE invoice number and ONE total, treat it as a SINGLE invoice — use line_items to capture the different cost codes/projects
- If a single invoice covers multiple projects, set project_id to the best matching one and note the others in ai_notes
- When in doubt, treat as one invoice

## Output format (return ONLY this JSON, no other text):
{
  "invoices": [
    {
      "vendor": "string",
      "invoice_number": "string",
      "invoice_date": "YYYY-MM-DD",
      "due_date": "YYYY-MM-DD",
      "total_amount": 0.00,
      "project_id": "uuid or null",
      "line_items": [
        { "cost_code": "string", "description": "string", "amount": 0.00 }
      ],
      "ai_confidence": "high" | "medium" | "low",
      "ai_notes": "string"
    }
  ]
}`;

export interface ExtractedInvoiceData {
  vendor: string;
  /** Matched vendor id from the vendors table, or null if no confident match. */
  vendor_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  project_id: string | null;
  line_items: {
    cost_code: string;
    description: string;
    amount: number;
    /** True when the cost_code string exists in the cost_codes master list. */
    cost_code_valid: boolean;
  }[];
  ai_confidence: "high" | "medium" | "low";
  ai_notes: string;
  /** Non-empty when the extracted vendor couldn't be resolved against the vendors table. */
  vendor_unmatched_name?: string;
  /** Any cost codes the AI produced that don't exist in the master list. */
  invalid_cost_codes?: string[];
}

export interface ExtractedInvoiceResponse {
  invoices: ExtractedInvoiceData[];
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const projectsRaw = formData.get("projects") as string | null;
    let projects: { id: string; name: string; type?: string; address?: string | null; subdivision?: string | null; block?: string | null; lot?: string | null }[] = [];
    if (projectsRaw) {
      try {
        const parsed = JSON.parse(projectsRaw);
        if (Array.isArray(parsed)) projects = parsed;
        else return NextResponse.json({ error: "Invalid projects format" }, { status: 400 });
      } catch {
        return NextResponse.json({ error: "Malformed projects JSON" }, { status: 400 });
      }
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const userInstruction = projects.length
      ? `Extract all invoice data from this PDF and return the JSON as specified.\n\nActive projects (match aggressively — prefer home_construction if conflict):\n${JSON.stringify(projects, null, 2)}`
      : "Extract all invoice data from this PDF and return the JSON as specified.";

    const content: ContentBlockParam[] = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      },
      { type: "text", text: userInstruction },
    ];

    const result = await extractStructured<unknown>({
      systemPrompt: SYSTEM_PROMPT,
      content,
      maxTokens: 2048,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const raw = result.data;

    // Normalise: accept both new { invoices: [...] } format and legacy single-object format
    let invoices: ExtractedInvoiceData[];
    if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray((raw as Record<string, unknown>).invoices)) {
      invoices = (raw as { invoices: ExtractedInvoiceData[] }).invoices;
    } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      // Legacy single-object response — wrap in array
      invoices = [raw as ExtractedInvoiceData];
    } else {
      invoices = [];
    }

    // Load matching sources once so each invoice in the batch gets resolved
    // against the same vendor + cost-code snapshot.
    const [{ data: vendorRows }, { data: costCodeRows }] = await Promise.all([
      supabase.from("vendors").select("id, name").eq("is_active", true),
      supabase.from("cost_codes").select("code").is("user_id", null),
    ]);
    const vendorList = (vendorRows ?? []) as { id: string; name: string }[];
    const validCodeSet = new Set(
      (costCodeRows ?? []).map((c) => String((c as { code: number | string }).code))
    );

    // Validate each invoice, resolve vendor_id / cost codes against the DB,
    // and surface unmatched results so the review UI can flag them.
    invoices.forEach((inv) => {
      if (!inv.vendor || !inv.total_amount) {
        inv.ai_confidence = "low";
        inv.ai_notes = ((inv.ai_notes ?? "") + " Key fields missing or unreadable.").trim();
      }
      // Enforce 7-day minimum due date from invoice_date
      if (inv.invoice_date && inv.due_date) {
        const minDue = new Date(inv.invoice_date + "T00:00:00");
        minDue.setDate(minDue.getDate() + 7);
        const minDueStr = minDue.toISOString().split("T")[0];
        if (inv.due_date < minDueStr) inv.due_date = minDueStr;
      }

      // Resolve vendor_id. If unmatched, keep the AI-extracted name around so
      // the UI can prompt the reviewer to pick an existing vendor or create one.
      const vendorId = findVendorId(inv.vendor, vendorList);
      inv.vendor_id = vendorId;
      if (!vendorId && inv.vendor) {
        inv.vendor_unmatched_name = inv.vendor;
      }

      // Validate + normalize each line item's cost code against the master list.
      const invalid: string[] = [];
      inv.line_items = (inv.line_items ?? []).map((li) => {
        const norm = normalizeCostCode(li.cost_code);
        const valid = norm !== null && validCodeSet.has(norm);
        if (!valid) {
          const shown = (li.cost_code ?? "").toString().trim() || "(blank)";
          invalid.push(shown);
        }
        return {
          cost_code: norm ?? (li.cost_code ?? ""),
          description: li.description ?? "",
          amount: li.amount ?? 0,
          cost_code_valid: valid,
        };
      });
      if (invalid.length) {
        inv.invalid_cost_codes = invalid;
        // Downgrade confidence: the reviewer must pick a valid code before save.
        if (inv.ai_confidence === "high") inv.ai_confidence = "medium";
        inv.ai_notes = (
          (inv.ai_notes ?? "") +
          ` Unknown cost code(s): ${invalid.join(", ")}.`
        ).trim();
      }
      // If vendor couldn't be resolved, same treatment — don't let a "high"
      // confidence hide a missing vendor match.
      if (!vendorId && inv.vendor) {
        if (inv.ai_confidence === "high") inv.ai_confidence = "medium";
      }
    });

    if (!invoices.length) {
      return NextResponse.json({ error: "No invoice data extracted" }, { status: 500 });
    }

    return NextResponse.json({ invoices } satisfies ExtractedInvoiceResponse);
  } catch (err) {
    console.error("Invoice extraction error:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
