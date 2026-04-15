import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { drawDisplayName } from "@/lib/draws";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ─── route ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // ── Fetch draw + invoices ────────────────────────────────────────────────

  const { data: draw } = await supabase
    .from("loan_draws")
    .select(`id, draw_number, draw_date, total_amount, status, notes, contacts ( id, name )`)
    .eq("id", id)
    .single();

  if (!draw) return new NextResponse("Draw not found", { status: 404 });

  const { data: drawInvoices } = await supabase
    .from("draw_invoices")
    .select(`
      id,
      invoices (
        id, vendor, invoice_number, amount, file_path,
        projects ( id, name, address ),
        cost_codes ( code, name )
      )
    `)
    .eq("draw_id", id);

  const lender = draw.contacts as { id: string; name: string } | null;

  type RawInvoice = {
    id: string;
    vendor: string | null;
    invoice_number: string | null;
    amount: number | null;
    file_path: string | null;
    projects: { id: string; name: string; address: string | null } | null;
    cost_codes: { code: string; name: string } | null;
  };

  const invoiceRows: RawInvoice[] = (drawInvoices ?? [])
    .map((di) => di.invoices as RawInvoice | null)
    .filter(Boolean) as RawInvoice[];

  // ── Loan lookup ──────────────────────────────────────────────────────────

  const projectIds = [...new Set(invoiceRows.map((r) => r.projects?.id).filter(Boolean) as string[])];
  const loanByProject = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: loanRows } = await supabase
      .from("loans")
      .select("project_id, loan_number, created_at")
      .in("project_id", projectIds)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    for (const l of loanRows ?? []) {
      if (!loanByProject.has(l.project_id)) loanByProject.set(l.project_id, l.loan_number);
    }
  }

  // ── Line items lookup ────────────────────────────────────────────────────

  const invoiceIds = invoiceRows.map((r) => r.id);
  const lineItemsByInvoice = new Map<string, { category: string; amount: number }[]>();
  if (invoiceIds.length > 0) {
    const { data: lineItems } = await supabase
      .from("invoice_line_items")
      .select(`invoice_id, amount, cost_codes ( name )`)
      .in("invoice_id", invoiceIds);
    for (const li of lineItems ?? []) {
      const cc = li.cost_codes as { name: string } | null;
      const entry = { category: cc?.name ?? "Uncategorized", amount: li.amount ?? 0 };
      if (!lineItemsByInvoice.has(li.invoice_id)) lineItemsByInvoice.set(li.invoice_id, []);
      lineItemsByInvoice.get(li.invoice_id)!.push(entry);
    }
  }

  // ── Build print rows ─────────────────────────────────────────────────────

  interface PrintRow {
    project: string;
    loanNumber: string;
    category: string;
    vendor: string;
    invoiceNumber: string;
    amount: number;
  }

  const printRows: PrintRow[] = [];
  for (const inv of invoiceRows) {
    const proj = inv.projects;
    const project = proj?.name ?? "—";
    const loanNumber = proj?.id ? (loanByProject.get(proj.id) ?? "—") : "—";
    const vendor = inv.vendor ?? "—";
    const invoiceNumber = inv.invoice_number ?? "—";
    const lineItems = lineItemsByInvoice.get(inv.id) ?? [];
    if (lineItems.length > 0) {
      for (const li of lineItems) {
        printRows.push({ project, loanNumber, category: li.category, vendor, invoiceNumber, amount: li.amount });
      }
    } else {
      printRows.push({ project, loanNumber, category: inv.cost_codes?.name ?? "—", vendor, invoiceNumber, amount: inv.amount ?? 0 });
    }
  }

  // Sort and group by loan
  printRows.sort((a, b) => a.loanNumber.localeCompare(b.loanNumber) || a.project.localeCompare(b.project));
  interface LoanGroup { loanNumber: string; rows: PrintRow[]; subtotal: number; }
  const groupMap = new Map<string, LoanGroup>();
  for (const row of printRows) {
    if (!groupMap.has(row.loanNumber)) groupMap.set(row.loanNumber, { loanNumber: row.loanNumber, rows: [], subtotal: 0 });
    const g = groupMap.get(row.loanNumber)!;
    g.rows.push(row);
    g.subtotal += row.amount;
  }
  const loanGroups = Array.from(groupMap.values());
  const grandTotal = loanGroups.reduce((s, g) => s + g.subtotal, 0);

  // ── Generate summary PDF (multi-page) ───────────────────────────────────

  const summaryDoc = await PDFDocument.create();
  const PAGE_W = 612;
  const PAGE_H = 792;
  const ML = 48;
  const MR = 48;
  const width = PAGE_W;
  const height = PAGE_H;

  const fontBold = await summaryDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await summaryDoc.embedFont(StandardFonts.Helvetica);

  const gray = rgb(0.58, 0.63, 0.69);
  const dark = rgb(0.118, 0.176, 0.239);
  const mid  = rgb(0.36, 0.42, 0.50);

  // Column definitions (shared across all pages)
  const cols: { label: string; x: number; w: number; right?: boolean }[] = [
    { label: "PROJECT",  x: ML,        w: 148 },
    { label: "LOAN #",   x: ML + 150,  w: 52  },
    { label: "CATEGORY", x: ML + 205,  w: 105 },
    { label: "VENDOR",   x: ML + 312,  w: 108 },
    { label: "INV. #",   x: ML + 422,  w: 68  },
    { label: "AMOUNT",   x: ML + 492,  w: 72, right: true },
  ];

  const ROW_H       = 16;
  const BOTTOM_STOP = 70; // minimum y before starting a new page

  // ── Draw column headers on any page, returns new y ──────────────────────
  function drawColHeaders(pg: PDFPage, startY: number): number {
    let y = startY;
    for (const col of cols) {
      pg.drawText(col.label, {
        x: col.right ? col.x + col.w - fontReg.widthOfTextAtSize(col.label, 7.5) : col.x,
        y,
        size: 7.5,
        font: fontReg,
        color: gray,
      });
    }
    y -= 5;
    pg.drawLine({ start: { x: ML, y }, end: { x: width - MR, y }, thickness: 1, color: rgb(0.89, 0.91, 0.94) });
    return y;
  }

  // ── First page: header block ─────────────────────────────────────────────
  let currentPage = summaryDoc.addPage([PAGE_W, PAGE_H]);

  const titleY = height - 44;
  const metaY  = height - 72;
  const divY   = metaY - 14;

  // Logo
  let textX = ML;
  try {
    const logoPath  = path.join(process.cwd(), "public", "prairie-sky-logo.png");
    const logoBytes = fs.readFileSync(logoPath);
    const logoImg   = await summaryDoc.embedPng(new Uint8Array(logoBytes));
    const logoDims  = logoImg.scale(1);
    const logoH     = 68;
    const logoW     = (logoDims.width / logoDims.height) * logoH;
    currentPage.drawImage(logoImg, { x: ML, y: metaY - 12, width: logoW, height: logoH });
    textX = ML + logoW + 16;
  } catch {
    // no logo — text starts at ML
  }

  // Title + meta
  currentPage.drawText("Construction Loan Draw Request", {
    x: textX, y: titleY, size: 18, font: fontBold, color: dark,
  });
  const dateStr = `Date: ${draw.draw_date}`;
  const dateW = fontBold.widthOfTextAtSize(dateStr, 11);
  currentPage.drawText("Customer: Prairie Sky, LLC", { x: textX, y: metaY, size: 11, font: fontBold, color: dark });
  currentPage.drawText(dateStr, { x: width - MR - dateW, y: metaY, size: 11, font: fontBold, color: dark });

  // Divider
  currentPage.drawLine({ start: { x: ML, y: divY }, end: { x: width - MR, y: divY }, thickness: 1.5, color: dark });

  // Column headers on first page
  let y = drawColHeaders(currentPage, divY - 18);

  // ── Helper: add a continuation page with column headers ──────────────────
  function addContinuationPage(): number {
    currentPage = summaryDoc.addPage([PAGE_W, PAGE_H]);
    const contHeaderY = height - 40;
    currentPage.drawText("Construction Loan Draw Request (continued)", {
      x: ML, y: contHeaderY, size: 10, font: fontBold, color: dark,
    });
    currentPage.drawLine({ start: { x: ML, y: contHeaderY - 8 }, end: { x: width - MR, y: contHeaderY - 8 }, thickness: 1, color: rgb(0.80, 0.84, 0.89) });
    return drawColHeaders(currentPage, contHeaderY - 26);
  }

  // ── Rows ─────────────────────────────────────────────────────────────────
  for (const group of loanGroups) {
    for (const row of group.rows) {
      y -= ROW_H;
      if (y < BOTTOM_STOP) {
        y = addContinuationPage();
        y -= ROW_H;
      }

      const vals = [
        truncate(row.project, 26),
        row.loanNumber,
        truncate(row.category, 18),
        truncate(row.vendor, 18),
        row.invoiceNumber,
      ];
      for (let i = 0; i < 5; i++) {
        currentPage.drawText(vals[i], { x: cols[i].x, y, size: 9, font: fontReg, color: dark });
      }
      const amtStr = fmt(row.amount);
      currentPage.drawText(amtStr, {
        x: cols[5].x + cols[5].w - fontReg.widthOfTextAtSize(amtStr, 9),
        y, size: 9, font: fontReg, color: dark,
      });
      currentPage.drawLine({ start: { x: ML, y: y - 4 }, end: { x: width - MR, y: y - 4 }, thickness: 0.5, color: rgb(0.95, 0.96, 0.98) });
    }

    // Subtotal row — add page if needed
    if (y - ROW_H - 8 < BOTTOM_STOP) {
      y = addContinuationPage();
    }
    y -= ROW_H;
    currentPage.drawLine({ start: { x: ML, y: y + 12 }, end: { x: width - MR, y: y + 12 }, thickness: 1, color: rgb(0.80, 0.84, 0.89) });
    currentPage.drawText(`TOTAL — Loan #${group.loanNumber}`, { x: ML, y, size: 9.5, font: fontBold, color: dark });
    const stStr = fmt(group.subtotal);
    currentPage.drawText(stStr, {
      x: cols[5].x + cols[5].w - fontBold.widthOfTextAtSize(stStr, 9.5),
      y, size: 9.5, font: fontBold, color: dark,
    });
    y -= 8;
  }

  // Grand total — add page if needed
  if (y - 36 < BOTTOM_STOP) {
    y = addContinuationPage();
  }
  y -= 4;
  currentPage.drawLine({ start: { x: ML, y }, end: { x: width - MR, y }, thickness: 1.5, color: dark });
  y -= 16;
  currentPage.drawText("Grand Total", { x: ML, y, size: 11, font: fontBold, color: dark });
  const gtStr = fmt(grandTotal);
  currentPage.drawText(gtStr, {
    x: cols[5].x + cols[5].w - fontBold.widthOfTextAtSize(gtStr, 11),
    y, size: 11, font: fontBold, color: dark,
  });

  // Footer on the last summary page
  const footerY = 36;
  currentPage.drawLine({ start: { x: ML, y: footerY + 14 }, end: { x: width - MR, y: footerY + 14 }, thickness: 0.5, color: rgb(0.89, 0.91, 0.94) });
  currentPage.drawText(`${drawDisplayName(draw.draw_date)} · ${lender?.name ?? "—"}`, {
    x: ML, y: footerY, size: 8, font: fontReg, color: mid,
  });
  const genStr = `Generated ${draw.draw_date}`;
  currentPage.drawText(genStr, {
    x: width - MR - fontReg.widthOfTextAtSize(genStr, 8),
    y: footerY, size: 8, font: fontReg, color: mid,
  });

  // ── Merge invoice PDFs ───────────────────────────────────────────────────

  const mergedDoc = await PDFDocument.create();

  // Copy ALL summary pages
  const summaryPageCount = summaryDoc.getPageCount();
  const copiedSummaryPages = await mergedDoc.copyPages(
    summaryDoc,
    Array.from({ length: summaryPageCount }, (_, i) => i)
  );
  for (const p of copiedSummaryPages) mergedDoc.addPage(p);

  // Append each invoice PDF in draw order
  for (const inv of invoiceRows) {
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
        // Embed image as a full-page PDF page
        const imgPage = mergedDoc.addPage([612, 792]);
        let embeddedImg;
        if (ext === "png") {
          embeddedImg = await mergedDoc.embedPng(new Uint8Array(bytes));
        } else {
          embeddedImg = await mergedDoc.embedJpg(new Uint8Array(bytes));
        }
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
        // Embed PDF pages directly
        const invDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pageCount = invDoc.getPageCount();
        const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
        const copiedPages = await mergedDoc.copyPages(invDoc, pageIndices);
        for (const p of copiedPages) mergedDoc.addPage(p);
      }
    } catch {
      // Skip invoices that fail to load
      continue;
    }
  }

  const pdfBytes = await mergedDoc.save();
  const drawName = drawDisplayName(draw.draw_date);
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
