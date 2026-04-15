"use client";

import { useState, type ReactNode } from "react";
import { FileDown, Printer } from "lucide-react";

type DatePreset = "this_month" | "this_quarter" | "this_year" | "all_time" | "custom";

interface ReportChromeProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Show date range selector. If false, children get no date range props. */
  showDateRange?: boolean;
  /** "range" = start+end (Income Statement), "asOf" = single date (Balance Sheet) */
  dateMode?: "range" | "asOf";
  /** Called when date range changes */
  onDateChange?: (range: { start: string; end: string }) => void;
  /** Called when as-of date changes */
  onAsOfChange?: (date: string) => void;
  /** Extra controls to render in the toolbar */
  extraControls?: ReactNode;
  /** Loading state — currently unused but accepted by consumers */
  loading?: boolean;
  /**
   * Report slug for PDF export. If set, Print/Export buttons hit
   * `/api/reports/{slug}` instead of the browser print dialog.
   */
  exportSlug?: string;
  /** Extra query params for the export URL (e.g. projectId) */
  exportParams?: Record<string, string | undefined>;
}

function getPresetRange(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.toISOString().split("T")[0];
  if (preset === "this_month") return { start: new Date(y, m, 1).toISOString().split("T")[0], end: today };
  if (preset === "this_quarter") return { start: new Date(y, Math.floor(m / 3) * 3, 1).toISOString().split("T")[0], end: today };
  if (preset === "all_time") return { start: "2020-01-01", end: today };
  return { start: `${y}-01-01`, end: today };
}

const PRESET_LABELS: Record<DatePreset, string> = {
  this_month: "Month",
  this_quarter: "Quarter",
  this_year: "Year",
  all_time: "All Time",
  custom: "Custom",
};

export default function ReportChrome({
  title,
  subtitle,
  children,
  showDateRange = false,
  dateMode = "range",
  onDateChange,
  onAsOfChange,
  extraControls,
  exportSlug,
  exportParams,
}: ReportChromeProps) {
  const today = new Date().toISOString().split("T")[0];
  const [preset, setPreset] = useState<DatePreset>("this_year");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [asOf, setAsOf] = useState(today);

  function handlePreset(p: DatePreset) {
    setPreset(p);
    if (p !== "custom" && onDateChange) {
      onDateChange(getPresetRange(p));
    }
  }

  function handleAsOf(date: string) {
    setAsOf(date);
    onAsOfChange?.(date);
  }

  function buildExportUrl(forDownload: boolean): string | null {
    if (!exportSlug) return null;
    const qs = new URLSearchParams();
    if (dateMode === "range") {
      const range = preset === "custom"
        ? { start: customStart, end: customEnd }
        : getPresetRange(preset);
      if (range.start) qs.set("start", range.start);
      if (range.end) qs.set("end", range.end);
    } else if (dateMode === "asOf") {
      qs.set("asOf", asOf);
    }
    if (exportParams) {
      for (const [k, v] of Object.entries(exportParams)) if (v) qs.set(k, v);
    }
    if (forDownload) qs.set("download", "1");
    return `/api/reports/${exportSlug}?${qs.toString()}`;
  }

  function handlePrint() {
    const url = buildExportUrl(false);
    if (!url) { window.print(); return; }
    window.open(url, "_blank");
  }

  function handleExport() {
    const url = buildExportUrl(true);
    if (!url) { window.print(); return; }
    // Trigger a download via a hidden anchor
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.target = "_blank";
    a.click();
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Report header */}
      <div className="mb-6 print:mb-4">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Printer size={13} />
              Print
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <FileDown size={13} />
              Export PDF
            </button>
          </div>
        </div>

        {/* Toolbar */}
        {(showDateRange || extraControls) && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {showDateRange && dateMode === "range" && (
              <>
                <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePreset(p)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        preset === p
                          ? "bg-[#4272EF] text-white"
                          : "text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {PRESET_LABELS[p]}
                    </button>
                  ))}
                </div>
                {preset === "custom" && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => {
                        setCustomStart(e.target.value);
                        if (e.target.value && customEnd) onDateChange?.({ start: e.target.value, end: customEnd });
                      }}
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                    <span className="text-gray-400 text-xs">to</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => {
                        setCustomEnd(e.target.value);
                        if (customStart && e.target.value) onDateChange?.({ start: customStart, end: e.target.value });
                      }}
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                )}
              </>
            )}
            {showDateRange && dateMode === "asOf" && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">As of</label>
                <input
                  type="date"
                  value={asOf}
                  onChange={(e) => handleAsOf(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                />
              </div>
            )}
            {extraControls && <div className="ml-auto flex items-center gap-2">{extraControls}</div>}
          </div>
        )}
      </div>

      {/* Report body */}
      {children}
    </div>
  );
}
