import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { REPORTS, type ReportSlug, type ReportParams } from "@/lib/reports/types";
import { renderReport } from "@/lib/reports/registry";
import { resolveLogo } from "@/lib/reports/logo";

export const dynamic = "force-dynamic";
// react-pdf + pdfkit + exceljs need the Node runtime on Vercel
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
  const format = sp.get("format") === "xlsx" ? "xlsx" : "pdf";
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
    if (format === "xlsx") {
      // Excel lives in its own server-only module (dynamic import keeps
      // exceljs out of every other bundle). Same getData as the PDF.
      const { renderReportXlsx } = await import("@/lib/reports/excel");
      const { buffer, filename } = await renderReportXlsx(slug, p);
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Resolve the logo with an HTTP fallback so it renders on serverless too
    const logo = await resolveLogo(req.nextUrl.origin);
    const doc = await renderReport(slug, p, logo);
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
    console.error(`[report:${slug}:${format}]`, err);
    return new NextResponse("Failed to render report", { status: 500 });
  }
}
