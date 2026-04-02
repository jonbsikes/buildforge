import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const COST_CODES_TEXT = `
Land Development (codes 1-33):
1=Raw Land, 2=Closing Costs, 3=Survey, 4=Filing Fees, 5=Permitting Fees, 6=Taxes, 7=Legal, 8=Engineering, 9=Environmental Study/Phase 1, 10=Geotechnical/Soil Testing, 11=Site Clearing, 12=Earth Work, 13=Detention/Retention Pond, 14=Water, 15=Storm Sewer, 16=Sanitary Sewer, 17=Paving, 18=Flatwork, 19=Utilities-Electrical, 20=Utilities-Gas, 21=Utilities-Internet, 22=Fencing, 23=Signage, 24=Street Signs, 25=Monument Signs/Entry Features, 26=Postal Service Boxes, 27=Landscaping, 28=Irrigation, 29=Street Lights, 30=HOA Setup, 31=Marketing, 32=Sales/Model Home Costs, 33=Miscellaneous

Home Construction (codes 34-102):
34=Lot, 35=Closing Cost (Loan), 36=Loan Origination Fee, 37=Permits & Inspection Fees, 38=Pre-Construction Survey, 39=Foundation Survey, 40=Property Taxes, 41=Engineering/Plans, 42=Insurance-Builders Risk, 43=Site Prep/Tree Clearing, 44=Concrete-Foundation, 45=Grade-Rough, 46=Grade-Final, 47=Frame-Material, 48=Framing-Labor, 49=Roofing-Turn Key, 50=Insulation-Turn Key, 51=Siding-Labor, 52=Sheetrock-Materials, 53=Sheetrock-Labor, 54=Water Well System, 55=Brick-Material, 56=Brick-Sand, 57=Brick-Labor, 58=Fireplace/Masonry, 59=Garage Door-Rough, 60=Garage Door-Final, 61=Trim-Material, 62=Trim-Exterior Doors, 63=Trim-Interior Doors, 64=Windows, 65=Trim-Hardware, 66=Trim-Labor, 67=Cabinets-Material, 68=Cabinets-Labor, 69=Paint-Interior Turn Key, 70=Paint-Exterior Turn Key, 71=Countertops-Turn Key, 72=Flooring, 73=Tile, 74=Mirrors & Shower Glass, 75=Appliances, 76=Smart Home/Low Voltage, 77=HVAC-Rough, 78=HVAC-Final, 79=Electrical-Rough, 80=Electrical-Fixtures, 81=Electrical-Final, 82=Plumbing-Ground, 83=Plumbing-Top Out, 84=Plumbing-Final, 85=Septic System, 86=Concrete-Flatwork, 87=Landscaping, 88=Gutters & Downspouts, 89=Clean Up-Frame, 90=Clean Up-Sheetrock, 91=Clean Up-Brick, 92=Clean Up-Trim, 93=Clean Up-Paint & Tile, 94=Clean Up-Final (Construction), 95=Clean Up-Final (Move-In), 96=Operating-Portable Toilet, 97=Operating-Dumpsters, 98=Operating-Electrical Temporary, 99=Operating-Water Temporary, 100=Survey-Final/As-Built, 101=Warranty Reserve, 102=Miscellaneous
`.trim();

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 400 });
  }

  const { invoiceId, filePath } = await request.json();
  if (!invoiceId || !filePath) {
    return NextResponse.json({ error: "invoiceId and filePath required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: signedData, error: signedError } = await supabase.storage
    .from("invoices")
    .createSignedUrl(filePath, 60);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: "Could not access invoice file" }, { status: 500 });
  }

  const fileRes = await fetch(signedData.signedUrl);
  if (!fileRes.ok) {
    return NextResponse.json({ error: "Could not download invoice file" }, { status: 500 });
  }
  const arrayBuffer = await fileRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: ([
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          {
            type: "text",
            text: `You are a construction accounting assistant for a residential builder.
Analyze this invoice and return ONLY a JSON object — no explanation, no markdown, no code fences.

Cost codes for reference:
${COST_CODES_TEXT}

Return this exact JSON shape:
{
  "vendor_name": "company or person name on the invoice",
  "invoice_number": "invoice or reference number, or null",
  "invoice_date": "YYYY-MM-DD or null",
  "amount": <number, total amount due>,
  "cost_code": <integer 1-102, best matching cost code>,
  "confidence": "high" | "medium" | "low",
  "ai_notes": "One sentence: why you chose this cost code. Note if invoice spans multiple codes."
}

confidence rules:
- high: clear vendor, amount, and obvious cost code match
- medium: some ambiguity in cost code or amount
- low: missing key fields, multi-category invoice, or very unclear`,
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any),
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  let extracted: Record<string, unknown> = {};
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    extracted = JSON.parse(cleaned);
  } catch {
    extracted = { raw: text };
  }

  const costCode = typeof extracted.cost_code === "number" ? extracted.cost_code : null;
  const confidence = ["high", "medium", "low"].includes(extracted.confidence as string)
    ? (extracted.confidence as string)
    : null;

  await supabase
    .from("invoices")
    .update({
      vendor: (extracted.vendor_name as string) || null,
      invoice_number: (extracted.invoice_number as string) || null,
      invoice_date: (extracted.invoice_date as string) || null,
      total_amount: typeof extracted.amount === "number" ? extracted.amount : null,
      amount: typeof extracted.amount === "number" ? extracted.amount : null,
      cost_code: costCode,
      ai_confidence: confidence,
      ai_notes: (extracted.ai_notes as string) || null,
      extracted_data: extracted,
      processed: true,
      // Low confidence stays in pending_review; medium and high also stay pending for human approval
      status: "pending_review",
    })
    .eq("id", invoiceId);

  return NextResponse.json({ extracted });
}
