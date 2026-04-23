import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getProjectsTree } from "@/lib/projects/tree";
import ProjectsTree from "@/components/projects/ProjectsTree";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { root, orgRollup } = await getProjectsTree();

  return (
    <>
      <Header title="Projects" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">
              {orgRollup.activeCount} active
              {orgRollup.atRiskCount > 0 && (
                <span
                  className="ml-3 text-sm font-medium"
                  style={{ color: "var(--status-over)" }}
                >
                  · {orgRollup.atRiskCount} at risk
                </span>
              )}
            </h2>
            <Link
              href="/projects/new"
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "var(--brand-blue)" }}
            >
              <Plus size={16} />
              New Project
            </Link>
          </div>

          <ProjectsTree root={root} orgRollup={orgRollup} />
        </div>
      </main>
    </>
  );
}
