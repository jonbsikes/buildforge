import Header from "@/components/layout/Header";
import Link from "next/link";
import { Plus, ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getProjectsTree, type TreeNode } from "@/lib/projects/tree";
import ProjectsTree from "@/components/projects/ProjectsTree";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNodeById(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Resolve the URL slug into a focus target node id.
 *
 * Supported shapes:
 *   /projects/tree/home/<subdivisionName>              → sub:home:<name>
 *   /projects/tree/land/<projectId>                    → landdev:<uuid>
 *   /projects/tree/land/<projectId>/phase-<n>          → phase:<uuid>:<n>
 */
function resolveFocusTargetId(slug: string[]): string | null {
  const [section, ident, maybePhase] = slug;
  if (!section || !ident) return null;

  if (section === "home") {
    return `sub:home:${decodeURIComponent(ident)}`;
  }
  if (section === "land") {
    if (maybePhase) {
      const m = maybePhase.match(/^phase-(\d+)$/);
      if (!m) return null;
      return `phase:${ident}:${m[1]}`;
    }
    return `landdev:${ident}`;
  }
  return null;
}

export default async function ScopedProjectsTreePage({ params }: PageProps) {
  const { slug } = await params;
  const focusId = resolveFocusTargetId(slug);
  if (!focusId) notFound();

  const { root, orgRollup } = await getProjectsTree();
  const node = findNodeById(root, focusId);
  if (!node) notFound();

  return (
    <>
      <Header title={node.name} />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/projects/tree"
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ChevronLeft size={14} />
              All projects
            </Link>
            <Link
              href="/projects/new"
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "var(--brand-blue)" }}
            >
              <Plus size={16} />
              New Project
            </Link>
          </div>

          <h2 className="text-lg font-bold text-gray-900 mb-6">
            {node.name}
            {node.subtitle && (
              <span className="ml-3 text-sm font-normal text-gray-500">· {node.subtitle}</span>
            )}
          </h2>

          <ProjectsTree root={root} orgRollup={orgRollup} initialFocusTargetId={focusId} />
        </div>
      </main>
    </>
  );
}
