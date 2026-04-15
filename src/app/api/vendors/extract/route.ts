import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a vendor data extraction assistant for a residential construction company.

Extract structured vendor information from the provided document (W9, COI, invoice, letterhead, vendor application, etc.) and return ONLY valid JSON — no markdown, no explanation.

## What to look for
- Company/vendor name
- Primary business contact (the main person you'd call)
- Accounting/billing contact (AP, billing, accounts receivable)
- Business address
- Phone numbers (label which is main, which is fax, which is cell if apparent)
- Email addresses
- Trade or type of work they perform
- COI (Certificate of Insurance) expiry date
- License expiry date or license number

## Trade classification
Map the vendor's trade/service to one of these descriptions if possible:
Land Dev: Raw Land, Closing Costs, Survey, Filing Fees, Permitting Fees, Taxes, Legal, Engineering, Environmental Study/Phase 1, Geotechnical/Soil Testing, Site Clearing, Earth Work, Detention/Retention Pond, Water, Storm Sewer, Sanitary Sewer, Paving, Flatwork, Utilities-Electrical, Utilities-Gas, Utilities-Internet, Fencing, Signage, Street Signs, Monument Signs/Entry Features, Postal Service Boxes, Landscaping, Irrigation, Street Lights, HOA Setup, Marketing, Sales/Model Home Costs, Miscellaneous
Home Construction: Lot, Closing Cost (Loan), Loan Origination Fee, Permits & Inspection Fees, Pre-Construction Survey, Foundation Survey, Property Taxes, Engineering/Plans, Insurance-Builders Risk, Site Prep/Tree Clearing, Concrete-Foundation, Grade-Rough, Grade-Final, Frame-Material, Framing-Labor, Roofing-Turn Key, Insulation-Turn Key, Siding-Labor, Sheetrock-Materials, Sheetrock-Labor, Water Well System, Brick-Material, Brick-Sand, Brick-Labor, Fireplace/Masonry Features, Garage Door-Rough, Garage Door-Final, Trim-Material, Trim-Exterior Doors, Trim-Interior Doors, Windows, Trim-Hardware, Trim-Labor, Cabinets-Material, Cabinets-Labor, Paint-Interior Turn Key, Paint-Exterior Turn Key, Countertops-Turn Key, Flooring, Tile, Mirrors & Shower Glass, Appliances, Smart Home/Low Voltage, HVAC-Rough, HVAC-Final, Electrical-Rough, Electrical-Fixtures, Electrical-Final, Plumbing-Ground, Plumbing-Top Out, Plumbing-Final, Septic System, Concrete-Flatwork, Landscaping, Gutters & Downspouts, Clean Up-Frame, Clean Up-Sheetrock, Clean Up-Brick, Clean Up-Trim, Clean Up-Paint & Tile, Clean Up-Final (Construction), Clean Up-Final (Move-In), Operating-Portable Toilet, Operating-Dumpsters, Operating-Electrical Temporary, Operating-Water Temporary, Survey-Final/As-Built, Warranty Reserve, Miscellaneous
G&A: Office Rent/Utilities, Office Supplies, Software & Subscriptions, Phone & Internet, Accounting & Bookkeeping, Legal-General Business, Bank Fees & Charges, Interest Expense, Payroll-Office Staff, Payroll-Superintendent/Field, Payroll Taxes & Benefits, Vehicle & Equipment, Fuel, Tools & Small Equipment, Continuing Education/Dues, Advertising & Marketing-Company, Travel & Entertainment, Miscellaneous-G&A

## Rules
- Dates must be YYYY-MM-DD; if only month/year is given use last day of that month
- If a field is not found, use null
- trades must be an array of strings matching the trade descriptions above (can be empty array)
- Do not invent information not present in the document

## Output format (return ONLY this JSON):
{
  "name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "address": "string or null",
  "trades": ["string"],
  "primary_contact_name": "string or null",
  "primary_contact_email": "string or null",
  "primary_contact_phone": "string or null",
  "accounting_contact_name": "string or null",
  "accounting_contact_email": "string or null",
  "accounting_contact_phone": "string or null",
  "coi_expiry_date": "YYYY-MM-DD or null",
  "license_expiry_date": "YYYY-MM-DD or null",
  "notes": "string or null"
}`;

export interface ExtractedVendorData {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  trades: string[];
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  accounting_contact_name: string | null;
  accounting_contact_email: string | null;
  accounting_contact_phone: string | null;
  coi_expiry_date: string | null;
  license_expiry_date: string | null;
  notes: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      return NextResponse.json({ error: "Only PDF or image files are supported" }, { status: 400 });
    }

    const contentBlock: ContentBlockParam = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as ContentBlockParam
      : { type: "image", source: { type: "base64", media_type: file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 } };

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            { type: "text", text: "Extract all vendor information from this document and return the JSON as specified." },
          ],
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: ExtractedVendorData;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Vendor extraction error:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
