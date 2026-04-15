"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "stages", label: "Build Stages" },
  { key: "field-logs", label: "Field Logs", route: true },
  { key: "todos", label: "To-Dos", route: true },
  { key: "budget", label: "Budget" },
  { key: "loans", label: "Loans" },
  { key: "contracts", label: "Contracts" },
  { key: "costs", label: "Costs" },
  { key: "sales", label: "Sales & Revenue" },
  { key: "schedule", label: "Schedule" },
];

export default function TabNav({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = searchParams.get("tab") ?? "overview";

  return (
    <div className="flex gap-0 border-b border-gray-200 mb-5 overflow-x-auto">
      {TABS.map(({ key, label, route }) => {
        const href = route
          ? `/projects/${projectId}/${key}`
          : `/projects/${projectId}?tab=${key}`;
        const isActive = route
          ? pathname.startsWith(`/projects/${projectId}/${key}`)
          : activeTab === key;

        return (
          <Link
            key={key}
            href={href}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              isActive
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
