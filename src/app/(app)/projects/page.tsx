import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { FolderOpen, Plus, MapPin, Calendar, DollarSign } from "lucide-react";
import type { Database } from "@/types/database";

type Project = Database["public"]["Tables"]["projects"]["Row"];

const statusStyles: Record<string, string> = {
  planning: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  on_hold: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-600",
};

const typeStyles: Record<string, string> = {
  home_construction: "bg-amber-100 text-amber-700",
  land_development: "bg-violet-100 text-violet-700",
};

const typeLabels: Record<string, string> = {
  home_construction: "Home Construction",
  land_development: "Land Development",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  const list = (projects ?? []) as Project[];

  return (
    <>
      <Header title="Projects" />
      <main className="flex-1 p-4 sm:p-6 overflow-auto bg-gray-50">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{list.length} project{list.length !== 1 ? "s" : ""}</p>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            <Plus size={15} />
            New Project
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FolderOpen size={28} className="text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-700 mb-1">No projects yet</h3>
            <p className="text-gray-500 text-sm mb-4">Create your first project to start tracking costs and stages.</p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
            >
              <Plus size={15} />
              New Project
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.map((project) => {
              const contractPrice = (project as unknown as { contract_price?: number }).contract_price;
              const startDate = (project as unknown as { start_date?: string }).start_date;
              const targetClose = (project as unknown as { target_close?: string; end_date?: string }).target_close
                ?? (project as unknown as { end_date?: string }).end_date;
              const projectType = (project as unknown as { project_type?: string }).project_type ?? "";

              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 hover:border-amber-300 hover:shadow-md transition-all group"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-gray-900 group-hover:text-amber-600 transition-colors leading-snug">
                      {project.name}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {projectType && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeStyles[projectType] ?? "bg-gray-100 text-gray-600"}`}>
                          {typeLabels[projectType] ?? projectType}
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyles[project.status] ?? statusStyles.planning}`}>
                        {project.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Address */}
                  {(project as unknown as { address?: string }).address && (
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-3">
                      <MapPin size={13} className="shrink-0" />
                      <span className="truncate">{(project as unknown as { address: string }).address}</span>
                    </div>
                  )}

                  {/* Footer row */}
                  <div className="border-t border-gray-100 pt-3 mt-2 flex items-center justify-between">
                    {contractPrice != null && contractPrice > 0 ? (
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <DollarSign size={13} className="text-gray-400" />
                        <span className="font-semibold text-sm">{fmt(contractPrice)}</span>
                        <span className="text-xs text-gray-400">contract</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No contract price set</span>
                    )}
                    {startDate && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar size={11} />
                        <span>{fmtDate(startDate)}</span>
                        {targetClose && <span>— {fmtDate(targetClose)}</span>}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
