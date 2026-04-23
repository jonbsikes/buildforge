import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { fetchDrawSummary } from "@/lib/draws-summary";
import { DrawSummaryDocument } from "@/lib/draws-summary-pdf";
import { getLogo } from "@/lib/reports/logo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: draw } = await supabase
    .from("loan_draws")
    .select(`id, draw_number, draw_date, total_amount, status, notes, contacts ( id, name )`)
    .eq("id", id)
    .single();

  if (!draw) return new NextResponse("Draw not found", { status: 404 });

  const lender = draw.contacts as { id: string; name: string } | null;

  const { invoices, summary } = await fetchDrawSummary(supabase as any, id);

  // ── Render summary via React-PDF (same visual as the Print Summary page) ──
  const summaryPdfBytes = await renderToBuffer(
    DrawSummaryDocument({
      drawDate: draw.draw_date,
      lenderName: lender?.name ?? "\u2014",
      notes: draw.notes,
      summary,
      logo: getLogo(),
    }) as any
  );

  // ── Merge summary + invoice PDFs via pdf-lib ───────────────────────────────
  const mergedDoc = await PDFDocument.create();

  const summaryDoc = await PDFDocument.load(
    summaryPdfBytes instanceof Uint8Array
      ? summaryPdfBytes
      : new Uint8Array(summaryPdfBytes as unknown as ArrayBufferLike)
  );
  const summaryPages = await mergedDoc.copyPages(
    summaryDoc,
    summaryDoc.getPageIndices()
  );
  for (const p of summaryPages) mergedDoc.addPage(p);

  for (const inv of invoices) {
    if (!inv.file_path) continue;

    const { data: signedData } = await supabase.storage
      .from("invoices")
      .createSignedUrl(inv.file_path, 300);
    if (!signedData?.signedUrl) continue;

    try {
      const res = await fetch(signedData.signedUrl);
      if (!res.ok) continue;
      const bytes = await res.arrayBuffer();

      const ext = inv.file_path.split(".").pop()?.toLowerCase() ?? "";
      const isImage = ["png", "jpg", "jpeg", "webp"].includes(ext);

      if (isImage) {
        const imgPage = mergedDoc.addPage([612, 792]);
        const embeddedImg =
          ext === "png"
            ? await mergedDoc.embedPng(new Uint8Array(bytes))
            : await mergedDoc.embedJpg(new Uint8Array(bytes));
        const { width: iW, height: iH } = embeddedImg;
        const scale = Math.min(612 / iW, 792 / iH);
        const dw = iW * scale;
        const dh = iH * scale;
        imgPage.drawImage(embeddedImg, {
          x: (612 - dw) / 2,
          y: (792 - dh) / 2,
          width: dw,
          height: dh,
        });
      } else {
        const invDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copiedPages = await mergedDoc.copyPages(invDoc, invDoc.getPageIndices());
        for (const p of copiedPages) mergedDoc.addPage(p);
      }
    } catch {
      continue;
    }
  }

  const pdfBytes = await mergedDoc.save();
  const filename = `Draw-Request-${draw.draw_date}.pdf`.replace(/\s+/g, "-");

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBytes.byteLength.toString(),
    },
  });
}
