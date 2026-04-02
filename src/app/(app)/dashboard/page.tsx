import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import {
  FolderOpen,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  FileText,
  CreditCard,
  Truck,
} from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
}

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-600",
  active: "bg-green-50 text-green-700",
  on_hold: "bg-amber-50 text-amber-700",
  completed: "bg-blue-50 text-blue-700",
  cancelled: "bg-red-50 text-red-600",
};

function StatCard({
  title, value, subtitle, icon, accent = false,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-[#4272EF]/20 bg-[#4272EF]/5" : "bg-white border-gray-200"}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#4272EF15" }}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];

  const [
    { data: projects },
    { data: costItems },
    { data: invoices },
    { data: draws },
    { data: vendors },
    { data: fieldTodos },
  ] = await Promise.all([
    supabase.from("projects").select("id, name, status, total_budget, project_type, subdivision").order("created_at", { ascending: false }),
    supabase.from("cost_items").select("budgeted_amount, actual_amount, project_id"),
    supabase.from("invoices").select("id, status, total_amount, due_date, project_id"),
    supabase.from("loan_draws").select("id, status, total_amount"),
    supabase.from("vendors").select("id, coi_expiry_date, license_expiry_date"),
    supabase.from("field_todos").select("id, status, priority"),
  ]);

  const activeProjects = (projects ?? []).filter(p => p.status === "active").length;
  const totalBudget = (projects ?? []).reduce((s, p) => s + (p.total_budget ?? 0), 0);
  const totalActual = (costItems ?? []).reduce((s, c) => s + (c.actual_amount ?? 0), 0);
  const totalBudgeted = (costItems ?? []).reduce((s, c) => s + (c.budgeted_amount ?? 0), 0);

  const pendingInvoices = (invoices ?? []).filter(i => i.status === "pending_review").length;
  const pastDueInvoices = (invoices ?? []).filter(i => i.status !== "paid" && i.due_date && i.due_date < today).length;
  const outstandingAmount = (invoices ?? []).filter(i => i.status !== "paid").reduce((s, i) => s + (i.total_amount ?? 0), 0);

  const totalFunded = (draws ?? []).filter(d => d.status === "funded").reduce((s, d) => s + d.total_amount, 0);

  const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
  const vendorAlerts = (vendors ?? []).filter(v => {
    const coi = daysUntil(v.coi_expiry_date);
    const lic = daysUntil(v.license_expiry_date);
    return (coi !== null && coi <= 30) || (lic !== null && lic <= 30);
  }).length;

  const urgentTodos = (fieldTodos ?? []).filter(t => t.status !== "done" && t.priority === "urgent").length;

  const overBudgetProjects = (projects ?? []).filter(p => {
    const items = (costItems ?? []).filter(c => c.project_id === p.id);
    const actual = items.reduce((s, c) => s + c.actual_amount, 0);
    const budget = items.reduce((s, c) => s + c.budgeted_amount, 0);
    return actual > budget && actual > 0;
  });

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-6 overflow-auto">
        {/* KPI grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <StatCard
            title="Active Projects"
            value={String(activeProjects)}
            subtitle={`${(projects ?? []).length} total`}
            icon={<FolderOpen size={18} style={{ color: "#4272EF" }} />}
          />
          <StatCard
            title="Total Budget"
            value={fmt(totalBudget)}
            subtitle="all projects"
            icon={<DollarSign size={18} style={{ color: "#4272EF" }} />}
          />
          <StatCard
            title="Actual Spend"
            value={fmt(totalActual)}
            subtitle={`${totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0}% of budgeted`}
            icon={<TrendingUp size={18} style={{ color: "#4272EF" }} />}
          />
          <StatCard
            title="AP Outstanding"
            value={fmt(outstandingAmount)}
            subtitle={`${pendingInvoices} pending review${pastDueInvoices > 0 ? ` · ${pastDueInvoices} past due` : ""}`}
            icon={<FileText size={18} style={{ color: "#4272EF" }} />}
            accent={pastDueInvoices > 0}
          />
          <StatCard
            title="Draws Funded"
            value={fmt(totalFunded)}
            subtitle="total funded draws"
            icon={<CreditCard size={18} style={{ color: "#4272EF" }} />}
          />
          <StatCard
            title="Alerts"
            value={String(vendorAlerts + urgentTodos + overBudgetProjects.length)}
            subtitle={`${vendorAlerts} vendor · ${urgentTodos} urgent todos`}
            icon={<AlertTriangle size={18} style={{ color: "#4272EF" }} />}
            accent={vendorAlerts + urgentTodos > 0}
          />
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Projects table - spans 2 cols */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Projects</h2>
              <Link href="/projects" className="text-sm font-medium" style={{ color: "#4272EF" }}>
                View all →
              </Link>
            </div>
            {(projects ?? []).length === 0 ? (
              <div className="px-6 py-12 text-center">
                <FolderOpen size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-3">No projects yet.</p>
                <Link href="/projects" className="text-sm text-white px-4 py-2 rounded-lg" style={{ backgroundColor: "#4272EF" }}>
                  Create first project
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Budget</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Spent</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(projects ?? []).map((project) => {
                      const items = (costItems ?? []).filter(c => c.project_id === project.id);
                      const spent = items.reduce((s, c) => s + c.actual_amount, 0);
                      const remaining = (project.total_budget ?? 0) - spent;
                      const isOver = remaining < 0;
                      return (
                        <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <Link href={`/projects/${project.id}`} className="font-medium text-gray-900 hover:underline">
                              {project.name}
                            </Link>
                            {project.subdivision && (
                              <span className="ml-2 text-xs text-gray-400">{project.subdivision}</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {project.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-gray-700">{fmt(project.total_budget ?? 0)}</td>
                          <td className="px-5 py-3 text-right text-gray-700">{fmt(spent)}</td>
                          <td className={`px-5 py-3 text-right font-medium ${isOver ? "text-red-600" : "text-green-600"}`}>
                            {isOver ? "-" : ""}{fmt(Math.abs(remaining))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right column: alerts + quick links */}
          <div className="space-y-4">
            {/* Alerts */}
            {(overBudgetProjects.length > 0 || vendorAlerts > 0 || urgentTodos > 0 || pastDueInvoices > 0) && (
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Alerts</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {pastDueInvoices > 0 && (
                    <Link href="/invoices" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <AlertTriangle size={16} className="text-red-500 shrink-0" />
                      <span className="text-sm text-gray-700">{pastDueInvoices} past-due invoice{pastDueInvoices !== 1 ? "s" : ""}</span>
                    </Link>
                  )}
                  {pendingInvoices > 0 && (
                    <Link href="/invoices?status=pending_review" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <FileText size={16} className="text-amber-500 shrink-0" />
                      <span className="text-sm text-gray-700">{pendingInvoices} invoice{pendingInvoices !== 1 ? "s" : ""} need review</span>
                    </Link>
                  )}
                  {vendorAlerts > 0 && (
                    <Link href="/vendors" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <Truck size={16} className="text-amber-500 shrink-0" />
                      <span className="text-sm text-gray-700">{vendorAlerts} vendor COI/license expiring</span>
                    </Link>
                  )}
                  {urgentTodos > 0 && (
                    <Link href="/field-logs" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <AlertTriangle size={16} className="text-red-500 shrink-0" />
                      <span className="text-sm text-gray-700">{urgentTodos} urgent to-do{urgentTodos !== 1 ? "s" : ""}</span>
                    </Link>
                  )}
                  {overBudgetProjects.map(p => (
                    <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                      <span className="text-sm text-gray-700">{p.name} over budget</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Quick Links</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { href: "/invoices", label: "AP & Invoices", icon: <FileText size={15} /> },
                  { href: "/field-logs", label: "Field Logs", icon: <AlertTriangle size={15} /> },
                  { href: "/draws", label: "Loans & Draws", icon: <CreditCard size={15} /> },
                  { href: "/vendors", label: "Vendors", icon: <Truck size={15} /> },
                  { href: "/reports", label: "Reports", icon: <TrendingUp size={15} /> },
                ].map(({ href, label, icon }) => (
                  <Link key={href} href={href} className="flex items-center gap-3 px-5 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
                    <span style={{ color: "#4272EF" }}>{icon}</span>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
