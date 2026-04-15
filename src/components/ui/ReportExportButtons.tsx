"use client";

import { FileDown, Printer } from "lucide-react";

interface ReportExportButtonsProps {
  /** Report slug, e.g. "cash-flow", "job-cost" */
  slug: string;
  /** Query params forwarded to /api/reports/{slug} (start, end, asOf, projectId, subdivisionId, year) */
  params?: Record<string, string | undefined>;
  className?: string;
}

/**
 * Print / Export-PDF button pair that hits the /api/reports/{slug} route.
 * Drop this into any report page that isn't wrapped in <ReportChrome>.
 */
export default function ReportExportButtons({ slug, params, className }: ReportExportButtonsProps) {
  function buildUrl(download: boolean): string {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) qs.set(k, v);
      }
    }
    if (download) qs.set("download", "1");
    const q = qs.toString();
    return `/api/reports/${slug}${q ? `?${q}` : ""}`;
  }

  return (
    <div className={`flex items-center gap-2 print:hidden ${className ?? ""}`}>
      <button
        onClick={() => window.open(buildUrl(false), "_blank")}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <Printer size={13} />
        Print
      </button>
      <button
        onClick={() => {
          const a = document.createElement("a");
          a.href = buildUrl(true);
          a.rel = "noopener";
          a.target = "_blank";
          a.click();
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <FileDown size={13} />
        Export PDF
      </button>
    </div>
  );
}
