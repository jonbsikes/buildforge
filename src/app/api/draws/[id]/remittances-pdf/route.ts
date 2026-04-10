import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { drawDisplayName } from "@/lib/draws";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  const [y, m, day] = parts;
  return `${parseInt(m)}/${parseInt(day)}/${y}`;
}

function trunc(str: string, max: number) {
  if (!str) return "—";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ─── route ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // ── Fetch draw ────────────────────────────────────────────────────────────

  const { data: draw } = await supabase
    .from("loan_draws")
    .select("id, draw_number, draw_date, status, contacts(id, name)")
    .eq("id", id)
    .single();

  if (!draw) return new NextResponse("Draw not found", { status: 404 });
  if (draw.status !== "funded" && draw.status !== "paid") {
    return new NextResponse("Remittances only available for funded draws", {
      status: 400,
    });
  }

  // ── Fetch vendor payments ─────────────────────────────────────────────────

  const { data: vendorPayments } = await supabase
    .from("vendor_payments")
    .select("id, vendor_name, amount, check_number, payment_date, status")
    .eq("draw_id", id)
    .order("vendor_name");

  if (!vendorPayments?.length) {
    return new NextResponse("No vendor payments found", { status: 404 });
  }

  const vpIds = vendorPayments.map((vp) => vp.id);

  // ── Fetch invoice links ───────────────────────────────────────────────────

  const { data: links } = await supabase
    .from("vendor_payment_invoices")
    .select(
      `vendor_payment_id,
       invoices (
         id, invoice_number, invoice_date, amount,
         cost_codes ( name ),
         projects ( name, address )
       )`
    )
    .in("vendor_payment_id", vpIds);

  // ── Fetch adjustments ─────────────────────────────────────────────────────

  const { data: adjustments } = await supabase
    .from("vendor_payment_adjustments")
    .select("vendor_payment_id, description, amount")
    .in("vendor_payment_id", vpIds)
    .order("created_at");

  // ── Group by vendor_payment_id ────────────────────────────────────────────

  const invoicesByVp = new Map<string, any[]>();
  for (const link of links ?? []) {
    const inv = link.invoices as any;
    if (!inv) continue;
    if (!invoicesByVp.has(link.vendor_payment_id))
      invoicesByVp.set(link.vendor_payment_id, []);
    invoicesByVp.get(link.vendor_payment_id)!.push(inv);
  }

  const adjsByVp = new Map<
    string,
    { description: string; amount: number }[]
  >();
  for (const adj of adjustments ?? []) {
    if (!adjsByVp.has(adj.vendor_payment_id))
      adjsByVp.set(adj.vendor_payment_id, []);
    adjsByVp
      .get(adj.vendor_payment_id)!
      .push({ description: adj.description, amount: adj.amount });
  }

  const lender = draw.contacts as { id: string; name: string } | null;
  const drawName = drawDisplayName(draw.draw_date);

  // ── Build PDF ─────────────────────────────────────────────────────────────

  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const ML = 48; // left margin
  const MR = 48; // right margin
  const INNER_W = PAGE_W - ML - MR; // 516

  // Colors
  const dark = rgb(0.118, 0.176, 0.239); // #1E293B
  const mid = rgb(0.392, 0.455, 0.545); // #647488
  const gray = rgb(0.580, 0.627, 0.694); // #94A3B8
  const light = rgb(0.886, 0.910, 0.941); // #E2E8F0
  const rowLine = rgb(0.953, 0.961, 0.976); // very light row separator
  const red = rgb(0.78, 0.1, 0.1); // for negative adjustments

  // Load logo once
  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  let logoDrawW = 0;
  const LOGO_H = 52;
  try {
    const logoPath = path.join(process.cwd(), "public", "prairie-sky-logo.png");
    const logoBytes = fs.readFileSync(logoPath);
    logoImage = await pdfDoc.embedPng(new Uint8Array(logoBytes));
    const dims = logoImage.scale(1);
    logoDrawW = (dims.width / dims.height) * LOGO_H;
  } catch {
    // No logo — proceed without it
  }

  // Table column definitions (shared across all pages)
  interface TableCol { label: string; x: number; w: number; right?: boolean; }
  const tCols: TableCol[] = [
    { label: "PROJECT / ADDRESS", x: ML, w: 148 },
    { label: "INVOICE #", x: ML + 150, w: 72 },
    { label: "DATE", x: ML + 224, w: 62 },
    { label: "CATEGORY", x: ML + 288, w: 138 },
    { label: "AMOUNT", x: ML + 428, w: 88, right: true },
  ];

  // ── One page per vendor ───────────────────────────────────────────────────

  for (const vp of vendorPayments) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const invoices = invoicesByVp.get(vp.id) ?? [];
    const adjs = adjsByVp.get(vp.id) ?? [];

    // Track current y (starts from top, decrements downward)
    let y = PAGE_H - 44; // = 748

    // ── Header ──────────────────────────────────────────────────────────────
    let textX = ML;
    if (logoImage) {
      page.drawImage(logoImage, {
        x: ML,
        y: y - LOGO_H,
        width: logoDrawW,
        height: LOGO_H,
      });
      textX = ML + logoDrawW + 14;
    }

    page.drawText("Check Remittance", {
      x: textX,
      y: y - 14,
      size: 16,
      font: fontBold,
      color: dark,
    });

    page.drawText("Prairie Sky, LLC", {
      x: textX,
      y: y - 32,
      size: 9,
      font: fontReg,
      color: mid,
    });

    y = y - LOGO_H - 18;

    // Header divider
    page.drawLine({
      start: { x: ML, y },
      end: { x: PAGE_W - MR, y },
      thickness: 2,
      color: dark,
    });
    y -= 20;

    // ── Vendor Name ──────────────────────────────────────────────────────────
    page.drawText(trunc(vp.vendor_name, 55), {
      x: ML,
      y,
      size: 14,
      font: fontBold,
      color: dark,
    });
    y -= 26;

    // ── Info Grid (1 row × 3 columns: check details only) ────────────────────
    const colW = INNER_W / 3; // 172px each
    const infoItems = [
      { label: "CHECK NUMBER", value: vp.check_number ? `#${vp.check_number}` : "—" },
      { label: "PAYMENT DATE", value: fmtDate(vp.payment_date) },
      { label: "CHECK AMOUNT", value: fmt(vp.amount) },
    ];

    for (let col = 0; col < infoItems.length; col++) {
      const item = infoItems[col];
      const ix = ML + col * colW;
      page.drawText(item.label, {
        x: ix,
        y,
        size: 7.5,
        font: fontReg,
        color: gray,
      });
      page.drawText(item.value, {
        x: ix,
        y: y - 13,
        size: 11,
        font: fontBold,
        color: dark,
      });
    }

    y -= 13 + 26; // value height + bottom padding

    // ── Invoice Table ─────────────────────────────────────────────────────────
    if (invoices.length > 0) {
      // Section label
      page.drawText("INVOICES COVERED BY THIS CHECK", {
        x: ML,
        y,
        size: 7.5,
        font: fontReg,
        color: gray,
      });
      y -= 13;

      // Column headers
      for (const col of tCols) {
        const labelW = fontReg.widthOfTextAtSize(col.label, 7.5);
        page.drawText(col.label, {
          x: col.right ? col.x + col.w - labelW : col.x,
          y,
          size: 7.5,
          font: fontReg,
          color: gray,
        });
      }
      y -= 6;

      // Header underline
      page.drawLine({
        start: { x: ML, y },
        end: { x: PAGE_W - MR, y },
        thickness: 1.5,
        color: light,
      });
      y -= 4;

      // Invoice rows
      let invoiceTotal = 0;
      for (const inv of invoices) {
        y -= 15;
        invoiceTotal += inv.amount ?? 0;

        const projStr = trunc(
          inv.projects?.address ?? inv.projects?.name ?? "—",
          25
        );
        const invNumStr = trunc(inv.invoice_number ?? "—", 13);
        const dateStr = fmtDate(inv.invoice_date);
        const catStr = trunc((inv.cost_codes as any)?.name ?? "—", 22);
        const amtStr = fmt(inv.amount);

        page.drawText(projStr, {
          x: tCols[0].x,
          y,
          size: 9,
          font: fontReg,
          color: dark,
        });
        page.drawText(invNumStr, {
          x: tCols[1].x,
          y,
          size: 9,
          font: fontReg,
          color: dark,
        });
        page.drawText(dateStr, {
          x: tCols[2].x,
          y,
          size: 9,
          font: fontReg,
          color: dark,
        });
        page.drawText(catStr, {
          x: tCols[3].x,
          y,
          size: 9,
          font: fontReg,
          color: dark,
        });
        page.drawText(amtStr, {
          x: tCols[4].x + tCols[4].w - fontReg.widthOfTextAtSize(amtStr, 9),
          y,
          size: 9,
          font: fontReg,
          color: dark,
        });

        // Row separator
        page.drawLine({
          start: { x: ML, y: y - 4 },
          end: { x: PAGE_W - MR, y: y - 4 },
          thickness: 0.5,
          color: rowLine,
        });
      }

      // Invoice total row
      y -= 16;
      page.drawLine({
        start: { x: ML, y: y + 11 },
        end: { x: PAGE_W - MR, y: y + 11 },
        thickness: 1.5,
        color: dark,
      });
      page.drawText("Invoice Total", {
        x: ML,
        y,
        size: 10,
        font: fontBold,
        color: dark,
      });
      const totStr = fmt(invoiceTotal);
      page.drawText(totStr, {
        x: tCols[4].x + tCols[4].w - fontBold.widthOfTextAtSize(totStr, 10),
        y,
        size: 10,
        font: fontBold,
        color: dark,
      });

      y -= 8;
    }

    // ── Adjustments ───────────────────────────────────────────────────────────
    if (adjs.length > 0) {
      y -= 10;

      page.drawText("ADJUSTMENTS", {
        x: ML,
        y,
        size: 7.5,
        font: fontReg,
        color: gray,
      });
      y -= 6;
      page.drawLine({
        start: { x: ML, y },
        end: { x: PAGE_W - MR, y },
        thickness: 1,
        color: light,
      });
      y -= 4;

      for (const adj of adjs) {
        y -= 14;
        const adjDesc = trunc(adj.description ?? "—", 68);
        const adjAmt = fmt(adj.amount);
        const isNeg = adj.amount < 0;

        page.drawText(adjDesc, {
          x: ML,
          y,
          size: 9,
          font: fontReg,
          color: dark,
        });
        page.drawText(adjAmt, {
          x: PAGE_W - MR - fontReg.widthOfTextAtSize(adjAmt, 9),
          y,
          size: 9,
          font: fontReg,
          color: isNeg ? red : dark,
        });

        page.drawLine({
          start: { x: ML, y: y - 4 },
          end: { x: PAGE_W - MR, y: y - 4 },
          thickness: 0.5,
          color: rowLine,
        });
      }

      // Net check amount after adjustments
      y -= 16;
      page.drawLine({
        start: { x: ML, y: y + 11 },
        end: { x: PAGE_W - MR, y: y + 11 },
        thickness: 1.5,
        color: dark,
      });
      page.drawText("Net Check Amount", {
        x: ML,
        y,
        size: 10,
        font: fontBold,
        color: dark,
      });
      const netStr = fmt(vp.amount);
      page.drawText(netStr, {
        x: PAGE_W - MR - fontBold.widthOfTextAtSize(netStr, 10),
        y,
        size: 10,
        font: fontBold,
        color: dark,
      });

      y -= 8;
    }

    // ── Signature Block (fixed position near bottom) ──────────────────────────
    const sigTop = 160;
    page.drawLine({
      start: { x: ML, y: sigTop },
      end: { x: PAGE_W - MR, y: sigTop },
      thickness: 0.5,
      color: light,
    });

    const halfW = (INNER_W - 32) / 2;

    // Signature line 1
    const sig1BaseY = sigTop - 36;
    page.drawLine({
      start: { x: ML, y: sig1BaseY },
      end: { x: ML + halfW, y: sig1BaseY },
      thickness: 1.5,
      color: gray,
    });
    page.drawText("AUTHORIZED SIGNATURE", {
      x: ML,
      y: sig1BaseY - 13,
      size: 7.5,
      font: fontReg,
      color: gray,
    });

    // Signature line 2
    const sig2X = ML + halfW + 32;
    page.drawLine({
      start: { x: sig2X, y: sig1BaseY },
      end: { x: PAGE_W - MR, y: sig1BaseY },
      thickness: 1.5,
      color: gray,
    });
    page.drawText("DATE", {
      x: sig2X,
      y: sig1BaseY - 13,
      size: 7.5,
      font: fontReg,
      color: gray,
    });

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = 38;
    page.drawLine({
      start: { x: ML, y: footerY + 14 },
      end: { x: PAGE_W - MR, y: footerY + 14 },
      thickness: 0.5,
      color: light,
    });
    page.drawText(`${trunc(vp.vendor_name, 55)}  ·  Prairie Sky, LLC`, {
      x: ML,
      y: footerY,
      size: 8,
      font: fontReg,
      color: gray,
    });
    const genStr = `Generated ${fmtDate(
      new Date().toISOString().split("T")[0]
    )}`;
    page.drawText(genStr, {
      x: PAGE_W - MR - fontReg.widthOfTextAtSize(genStr, 8),
      y: footerY,
      size: 8,
      font: fontReg,
      color: gray,
    });
  }

  // ── Return PDF ────────────────────────────────────────────────────────────

  const pdfBytes = await pdfDoc.save();
  const filename = `Check-Remittances-${draw.draw_date}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBytes.byteLength.toString(),
    },
  });
}
