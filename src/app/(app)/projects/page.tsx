import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { Building2, Landmark, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, address, status, project_type, subdivision, start_date, created_at")
    .order("created_at", { ascending: false });

  const homeProjects = (projects ?? []).filter((p) => p.project_type === "home_construction");
  const landProjects = (projects ?? []).filter((p) => p.project_type === "land_development");

  const statusColor: Record<string, string> = {
    planning:   "bg-gray-100 text-gray-600",
    active:     "bg-green-100 text-green-700",
    on_hold:    "bg-amber-100 text-amber-700",
    completed:  "bg-blue-100 text-blue-700",
    cancelled:  "bg-red-100 text-red-600",
  };

  return (
    <>
      <Header title="Projects" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">
            {(projects ?? []).length} project{(projects ?? []).length !== 1 ? "s" : ""}
          </p>
          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
          >
            <Plus size={16} />
            New Project
          </Link>
        </div>

        <div className="space-y-6">
          {/* Home Construction */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={16} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Home Construction
              </h2>
              <span className="text-xs text-gray-400">({homeProjects.length})</span>
            </div>

            {homeProjects.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
                No home construction projects yet.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {homeProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {p.subdivision && (
                          <span className="text-xs text-gray-400">{p.subdivision}</span>
                        )}
                        {p.address && (
                          <span className="text-xs text-gray-400">{p.address}</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        statusColor[p.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.status.replace("_", " ")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Land Development */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Landmark size={16} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Land Development
              </h2>
              <span className="text-xs text-gray-400">({landProjects.length})</span>
            </div>

            {landProjects.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-8 text-center text-sm text-gray-400">
                No land development projects yet.
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {landProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      {p.address && (
                        <p className="text-xs text-gray-400 mt-0.5">{p.address}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        statusColor[p.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.status.replace("_", " ")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
