"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileDown } from "lucide-react";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const TABS: { name: string; desc: string }[] = [
  { name: "Cover", desc: "Key figures, contents, and basis notes for your CPA" },
  { name: "Trial Balance", desc: "Every account — beginning balance, year debits/credits, ending balance" },
  { name: "Income Statement", desc: "Account-level P&L for the year (accrual basis)" },
  { name: "Balance Sheet", desc: "Account balances as of December 31" },
  { name: "General Ledger", desc: "Every posted journal entry line, filterable" },
  { name: "1099 Vendors", desc: "Vendors paid $600+ in cleared checks — cash basis" },
  { name: "Paid Invoices", desc: "Invoice register of checks cleared during the year — cash basis" },
  { name: "Loan Schedule", desc: "Per-loan balances, advances, paydowns + capitalized interest by project" },
  { name: "Project WIP", desc: "Beginning/ending WIP-CIP and year-end loan balance per project" },
];

export default function TaxExportClient() {
  const [year, setYear] = useState(String(CURRENT_YEAR));

  function triggerDownload(format?: "xlsx") {
    const qs = new URLSearchParams({ year, download: "1" });
    if (format) qs.set("format", format);
    const a = document.createElement("a");
    a.href = `/api/reports/tax-export?${qs.toString()}`;
    a.rel = "noopener";
    a.target = "_blank";
    a.click();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Tax Package Export</h2>
          <p className="text-sm text-gray-500">
            One Excel workbook with everything your CPA needs for the year — each schedule on its own
            tab, with currency formatting and filterable detail.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tax Year</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] bg-white"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Worksheets included */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Worksheets Included</p>
          {TABS.map((t) => (
            <div key={t.name} className="flex items-start gap-2.5 text-sm">
              <FileSpreadsheet size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-medium text-gray-700">{t.name}</span>
                <p className="text-xs text-gray-400">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => triggerDownload("xlsx")}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
          >
            <Download size={15} />
            Download {year} Tax Package (Excel)
          </button>
          <button
            onClick={() => triggerDownload()}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <FileDown size={15} />
            PDF Summary
          </button>
        </div>
      </div>
    </div>
  );
}
