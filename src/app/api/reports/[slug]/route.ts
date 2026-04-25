import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { REPORTS, type ReportSlug, type ReportParams } from "@/lib/reports/types";
import { renderReport } from "@/lib/reports/registry";

export const dynamic = "force-dynamic";
// react-pdf + pdfkit needs the Node runtime on Vercel
export const runtime = "nodejs";

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { slug: rawSlug } = await params;
  const slug = rawSlug as ReportSlug;
  const descriptor = REPORTS[slug];
  if (!descriptor) {
    return new NextResponse(`Unknown report: ${rawSlug}`, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const p: ReportParams = {
    start: sp.get("start") ?? undefined,
    end: sp.get("end") ?? undefined,
    asOf: sp.get("asOf") ?? undefined,
    projectId: sp.get("projectId") ?? undefined,
    subdivisionId: sp.get("subdivisionId") ?? undefined,
    year: sp.get("year") ?? undefined,
    projectType: sp.get("projectType") ?? undefined,
    subdivision: sp.get("subdivision") ?? undefined,
    status: sp.get("status") ?? undefined,
  };

  // Sensible defaults so a missing query param never 500s
  if (descriptor.kind === "range" && (!p.start || !p.end)) {
    const y = new Date().getFullYear();
    p.start = p.start ?? `${y}-01-01`;
    p.end = p.end ?? todayISO();
  }
  if ((descriptor.kind === "asOf" || descriptor.kind === "range-or-project") && !p.asOf) {
    p.asOf = todayISO();
  }

  try {
    const doc = await renderReport(slug, p);
    const pdf = await renderToBuffer(doc as any);
    const filename = descriptor.filename(p).replace(/\s+/g, "-");
    // Inline so "Print" opens the PDF in a new tab; client can still force download.
    return new NextResponse(pdf as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(`[report:${slug}]`, err);
    return new NextResponse("Failed to render report", { status: 500 });
  }
}
