"use client";

import { usePathname, useRouter } from "next/navigation";

export const PROJECT_REPORTS = [
  { label: "Job Cost", href: "/reports/job-cost" },
  { label: "Budget Variance", href: "/reports/budget-variance" },
  { label: "Stage Progress", href: "/reports/stage-progress" },
  { label: "Gantt", href: "/reports/gantt" },
  { label: "Field Logs", href: "/reports/field-logs" },
  { label: "Selections", href: "/reports/selections" },
  { label: "Subdivision Overview", href: "/reports/subdivision" },
  { label: "Budget Summary", href: "/reports/overview" },
] as const;

/**
 * Dropdown to jump between project reports. Rendered at the top of every
 * /reports/* page so the user can switch reports without going back to nav.
 */
export default function ReportSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const current =
    PROJECT_REPORTS.find((r) => pathname === r.href || pathname.startsWith(r.href + "/"))?.href ??
    PROJECT_REPORTS[0].href;

  return (
    <div className="flex items-center gap-3 mb-4 print:hidden">
      <label htmlFor="report-switcher" className="text-sm font-medium text-gray-700">
        Report
      </label>
      <select
        id="report-switcher"
        value={current}
        onChange={(e) => router.push(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
      >
        {PROJECT_REPORTS.map((r) => (
          <option key={r.href} value={r.href}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
