"use client";

import { FileDown, FileSpreadsheet, Printer } from "lucide-react";

interface ReportExportButtonsProps {
  /** Report slug, e.g. "cash-flow", "job-cost" */
  slug: string;
  /** Query params forwarded to /api/reports/{slug} (start, end, asOf, projectId, subdivisionId, year) */
  params?: Record<string, string | undefined>;
  className?: string;
  /** Hide the Print button (e.g. when a page provides its own) */
  hidePrint?: boolean;
}

/**
 * Print / PDF / Excel button set that hits the /api/reports/{slug} route.
 * Drop this into any report page. Every report gets both a PDF and an Excel
 * export — same data, same totals.
 */
export default function ReportExportButtons({ slug, params, className, hidePrint }: ReportExportButtonsProps) {
  function buildUrl(opts: { download?: boolean; format?: "xlsx" }): string {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) qs.set(k, v);
      }
    }
    if (opts.download) qs.set("download", "1");
    if (opts.format) qs.set("format", opts.format);
    const q = qs.toString();
    return `/api/reports/${slug}${q ? `?${q}` : ""}`;
  }

  function triggerDownload(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.target = "_blank";
    a.click();
  }

  const buttonClass =
    "flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors";

  return (
    <div className={`flex items-center gap-2 print:hidden ${className ?? ""}`}>
      {!hidePrint && (
        <button onClick={() => window.open(buildUrl({}), "_blank")} className={buttonClass}>
          <Printer size={13} />
          Print
        </button>
      )}
      <button onClick={() => triggerDownload(buildUrl({ download: true }))} className={buttonClass}>
        <FileDown size={13} />
        PDF
      </button>
      <button onClick={() => triggerDownload(buildUrl({ format: "xlsx" }))} className={buttonClass}>
        <FileSpreadsheet size={13} />
        Excel
      </button>
    </div>
  );
}
