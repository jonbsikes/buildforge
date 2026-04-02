import Header from "@/components/layout/Header";
import Link from "next/link";
import { Tag, ChevronRight } from "lucide-react";

const sections = [
  {
    href: "/settings/cost-codes",
    icon: Tag,
    title: "Cost Codes",
    description: "Manage your cost codes for Home Construction and Land Development projects.",
  },
];

export default function SettingsPage() {
  return (
    <>
      <Header title="Settings" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-3">
          {sections.map(({ href, icon: Icon, title, description }) => (
            <Link key={href} href={href}
              className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all group">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                <Icon size={20} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">{title}</p>
                <p className="text-sm text-gray-500">{description}</p>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
