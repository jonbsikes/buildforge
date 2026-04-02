import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";

const client = new Anthropic();

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
- If due_date is not stated, set it to invoice_date + 30 days
- All amount values must be plain numbers (no $ signs, no commas)
- ai_confidence: "high" = all key fields clearly readable; "medium" = some fields estimated/unclear; "low" = vendor, amount, or date unreadable/conflicting
- ai_notes: brief explanation only if confidence is medium or low; empty string otherwise

## Output format (return ONLY this JSON, no other text):
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
  "ai_notes": "string"
}`;

export interface ExtractedInvoiceData {
  vendor: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  line_items: { cost_code: string; description: string; amount: number }[];
  ai_confidence: "high" | "medium" | "low";
  ai_notes: string;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

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

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            } as ContentBlockParam,
            {
              type: "text",
              text: "Extract all invoice data from this PDF and return the JSON as specified.",
            },
          ] as ContentBlockParam[],
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    // Strip any markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: ExtractedInvoiceData;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    // Validate required fields
    if (!parsed.vendor || !parsed.total_amount) {
      parsed.ai_confidence = "low";
      parsed.ai_notes = (parsed.ai_notes ?? "") + " Key fields missing or unreadable.";
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Invoice extraction error:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
