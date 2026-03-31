import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import Header from "@/components/layout/Header";
import type { Database } from "@/types/database";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type CostItemRow = Database["public"]["Tables"]["cost_items"]["Row"];
import {
  FolderOpen,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean };
  color: string;
}

function StatCard({ title, value, subtitle, icon, trend, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-sm text-gray-500">{subtitle}</p>
        {trend && (
          <span
            className={`flex items-center text-xs font-medium ${
              trend.positive ? "text-green-600" : "text-red-600"
            }`}
          >
            {trend.positive ? (
              <ArrowUpRight size={12} />
            ) : (
              <ArrowDownRight size={12} />
            )}
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch summary data
  const [projectsResult, costItemsResult] = await Promise.all([
    supabase.from("projects").select("id, name, status, total_budget"),
    supabase.from("cost_items").select("budgeted_amount, actual_amount, project_id"),
  ]);

  const projects = (projectsResult.data ?? []) as Pick<ProjectRow, "id" | "name" | "status" | "total_budget">[];
  const costItems = (costItemsResult.data ?? []) as Pick<CostItemRow, "budgeted_amount" | "actual_amount" | "project_id">[];

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const totalBudget = projects.reduce((sum, p) => sum + (p.total_budget ?? 0), 0);
  const totalBudgeted = costItems.reduce((sum, c) => sum + (c.budgeted_amount ?? 0), 0);
  const totalActual = costItems.reduce((sum, c) => sum + (c.actual_amount ?? 0), 0);
  const variance = totalBudgeted - totalActual;
  const overBudgetProjects = projects.filter((p) => {
    const projectItems = costItems.filter((c) => c.project_id === p.id);
    const actual = projectItems.reduce((sum, c) => sum + (c.actual_amount ?? 0), 0);
    const budgeted = projectItems.reduce((sum, c) => sum + (c.budgeted_amount ?? 0), 0);
    return actual > budgeted;
  });

  function formatCurrency(n: number) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(n);
  }

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-6 overflow-auto">
        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Active Projects"
            value={String(activeProjects)}
            subtitle={`${projects.length} total`}
            icon={<FolderOpen size={20} className="text-blue-600" />}
            color="bg-blue-50"
          />
          <StatCard
            title="Total Budget"
            value={formatCurrency(totalBudget)}
            subtitle="across all projects"
            icon={<DollarSign size={20} className="text-emerald-600" />}
            color="bg-emerald-50"
          />
          <StatCard
            title="Budget vs Actuals"
            value={formatCurrency(totalActual)}
            subtitle={`${formatCurrency(Math.abs(variance))} ${variance >= 0 ? "under" : "over"} budget`}
            icon={<TrendingUp size={20} className="text-violet-600" />}
            trend={
              totalBudgeted > 0
                ? {
                    value: `${Math.abs(((totalActual - totalBudgeted) / totalBudgeted) * 100).toFixed(1)}%`,
                    positive: totalActual <= totalBudgeted,
                  }
                : undefined
            }
            color="bg-violet-50"
          />
          <StatCard
            title="Over Budget"
            value={String(overBudgetProjects.length)}
            subtitle="projects need attention"
            icon={<AlertTriangle size={20} className="text-amber-600" />}
            color="bg-amber-50"
          />
        </div>

        {/* Projects table */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Projects</h2>
            <a
              href="/projects/new"
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              + New Project
            </a>
          </div>

          {projects.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FolderOpen size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No projects yet.</p>
              <a
                href="/projects/new"
                className="mt-3 inline-block text-sm text-blue-600 hover:underline"
              >
                Create your first project
              </a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Budget
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Spent
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Remaining
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {projects.map((project) => {
                    const items = costItems.filter((c) => c.project_id === project.id);
                    const spent = items.reduce((s, c) => s + (c.actual_amount ?? 0), 0);
                    const remaining = (project.total_budget ?? 0) - spent;
                    const isOverBudget = remaining < 0;

                    const statusColors: Record<string, string> = {
                      planning: "bg-gray-100 text-gray-600",
                      active: "bg-green-100 text-green-700",
                      on_hold: "bg-amber-100 text-amber-700",
                      completed: "bg-blue-100 text-blue-700",
                      cancelled: "bg-red-100 text-red-600",
                    };

                    return (
                      <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <a
                            href={`/projects/${project.id}`}
                            className="font-medium text-gray-900 hover:text-blue-600"
                          >
                            {project.name}
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[project.status] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {project.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-gray-700">
                          {formatCurrency(project.total_budget ?? 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-700">
                          {formatCurrency(spent)}
                        </td>
                        <td
                          className={`px-6 py-4 text-right font-medium ${
                            isOverBudget ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {isOverBudget ? "-" : ""}
                          {formatCurrency(Math.abs(remaining))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
