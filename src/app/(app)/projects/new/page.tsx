import Header from "@/components/layout/Header";
import Link from "next/link";
import { Building2, Landmark, ChevronRight } from "lucide-react";

export default function NewProjectTypePage() {
  return (
    <>
      <Header title="New Project" />
      <main className="flex-1 p-4 lg:p-6">
        <div className="max-w-lg mx-auto">
          <p className="text-sm text-gray-500 mb-6">
            Select the type of project to create.
          </p>

          <div className="space-y-3">
            <Link
              href="/projects/new/home"
              className="flex items-center justify-between p-5 bg-white rounded-xl border border-gray-200 hover:border-[#4272EF] hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Building2 size={20} className="text-[#4272EF]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Home Construction</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Single-family homes, subdivisions
                  </p>
                </div>
              </div>
              <ChevronRight
                size={18}
                className="text-gray-300 group-hover:text-[#4272EF] transition-colors"
              />
            </Link>

            <Link
              href="/projects/new/land"
              className="flex items-center justify-between p-5 bg-white rounded-xl border border-gray-200 hover:border-[#4272EF] hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Landmark size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Land Development</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Subdivision infrastructure, lot preparation
                  </p>
                </div>
              </div>
              <ChevronRight
                size={18}
                className="text-gray-300 group-hover:text-[#4272EF] transition-colors"
              />
            </Link>
          </div>

          <div className="mt-6">
            <Link
              href="/projects"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Back to Projects
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
