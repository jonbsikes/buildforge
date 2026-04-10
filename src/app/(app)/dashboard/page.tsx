import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ProjectCard from "@/components/dashboard/ProjectCard";
import Link from "next/link";
import {
  FolderOpen, AlertTriangle, FileText, ClipboardList,
  ChevronRight, MapPin, Calendar, HardHat, Hammer,
  TreePine, AlertCircle, Truck, ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0]!;
  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const weekStr = weekFromNow.toISOString().split("T")[0]!;

  const [
    { data: projects }, { data: pccRows }, { data: invoices },
    { data: vendors }, { data: fieldTodos }, { data: buildStages },
    { data: recentLogs },
  ] = await Promise.all([
    supabase.from("projects").select("id, name, status, project_type, subdivision, address, start_date, block, lot, plan, home_size_sf, size_acres, number_of_lots").in("status", ["active", "pre_construction"]).order("created_at", { ascending: false }),
    supabase.from("project_cost_codes").select("project_id, budgeted_amount"),
    supabase.from("invoices").select("id, status, amount, total_amount, due_date, project_id, vendor, invoice_number"),
    supabase.from("vendors").select("id, name, coi_expiry_date, license_expiry_date"),
    supabase.from("field_todos").select("id, status, priority, description, project_id, due_date").neq("status", "done"),
    supabase.from("build_stages").select("id, project_id, stage_name, stage_number, status, planned_start_date, planned_end_date, actual_start_date, actual_end_date").order("stage_number", { ascending: true }),
    supabase.from("field_logs").select("id, log_date, notes, project_id").order("log_date", { ascending: false }).limit(5),
  ]);

  const allProjects = projects ?? [];
  const activeCount = allProjects.filter((p) => p.status === "active").length;

  const budgetByProject: Record<string, number> = {};
  for (const pcc of pccRows ?? []) if (pcc.project_id) budgetByProject[pcc.project_id] = (budgetByProject[pcc.project_id] ?? 0) + (pcc.budgeted_amount ?? 0);
  const actualByProject: Record<string, number> = {};
  for (const inv of (invoices ?? []).filter((i) => i.status === "approved" || i.status === "released" || i.status === "cleared"))
    if (inv.project_id) actualByProject[inv.project_id] = (actualByProject[inv.project_id] ?? 0) + (inv.total_amount ?? inv.amount ?? 0);

  const todosByProject: Record<string, number> = {};
  let urgentTodos = 0;
  for (const t of fieldTodos ?? []) {
    if (t.project_id) todosByProject[t.project_id] = (todosByProject[t.project_id] ?? 0) + 1;
    if (t.priority === "urgent") urgentTodos++;
  }
  const openTodos = (fieldTodos ?? []).length;

  const stagesByProject: Record<string, NonNullable<typeof buildStages>> = {};
  for (const s of buildStages ?? []) { if (!stagesByProject[s.project_id]) stagesByProject[s.project_id] = []; stagesByProject[s.project_id]!.push(s); }

  function getCurrentStage(pid: string) {
    const st = stagesByProject[pid] ?? [];
    return st.find((s) => s.status === "in_progress") ?? st.find((s) => s.status === "delayed") ?? st.find((s) => s.status === "not_started") ?? null;
  }
  function getStageProgress(pid: string) {
    const st = stagesByProject[pid] ?? [];
    return st.length === 0 ? 0 : Math.round((st.filter((s) => s.status === "complete").length / st.length) * 100);
  }
  function getNextStage(pid: string) {
    const st = stagesByProject[pid] ?? [];
    const cur = getCurrentStage(pid);
    return cur ? st.find((s) => s.stage_number > cur.stage_number && s.status === "not_started") ?? null : null;
  }

  const pendingInvoices = (invoices ?? []).filter((i) => i.status === "pending_review").length;
  const pastDueInvoices = (invoices ?? []).filter((i) => i.status !== "cleared" && i.status !== "void" && i.due_date && i.due_date < today).length;
  const outstandingAP = (invoices ?? []).filter((i) => i.status === "approved" || i.status === "pending_review").reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);
  const daysUntil = (d: string | null) => d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
  const expiringVendors = (vendors ?? []).filter((v) => { const c = daysUntil(v.coi_expiry_date); const l = daysUntil(v.license_expiry_date); return (c !== null && c <= 30) || (l !== null && l <= 30); });
  const overBudgetProjects = allProjects.filter((p) => { const a = actualByProject[p.id] ?? 0; const b = budgetByProject[p.id] ?? 0; return a > b && b > 0; });
  const totalAlerts = pendingInvoices + pastDueInvoices + urgentTodos + expiringVendors.length + overBudgetProjects.length;

  const thisWeekStages = (buildStages ?? []).filter((s) => {
    const start = s.planned_start_date ?? s.actual_start_date;
    const end = s.planned_end_date ?? s.actual_end_date;
    return (start && start >= today && start <= weekStr) || (end && end >= today && end <= weekStr);
  });
  const invoicesDueThisWeek = (invoices ?? []).filter((i) => i.status !== "cleared" && i.status !== "void" && i.due_date && i.due_date >= today && i.due_date <= weekStr);
  const todosDueThisWeek = (fieldTodos ?? []).filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekStr);
  const hasWeeklyActivity = thisWeekStages.length > 0 || invoicesDueThisWeek.length > 0 || todosDueThisWeek.length > 0;

  const projectNames: Record<string, string> = {};
  for (const p of allProjects) projectNames[p.id] = p.name;
  const homeProjects = allProjects.filter((p) => p.project_type === "home_construction");
  const landProjects = allProjects.filter((p) => p.project_type === "land_development");
  const subdivisions: Record<string, typeof homeProjects> = {};
  const noSubdivision: typeof homeProjects = [];
  for (const p of homeProjects) {
    if (p.subdivision) { if (!subdivisions[p.subdivision]) subdivisions[p.subdivision] = []; subdivisions[p.subdivision]!.push(p); }
    else noSubdivision.push(p);
  }

  function cardProps(p: (typeof allProjects)[0]) {
    return { project: p, currentStage: getCurrentStage(p.id), nextStage: getNextStage(p.id), progress: getStageProgress(p.id), budget: budgetByProject[p.id] ?? 0, spent: actualByProject[p.id] ?? 0, todoCount: todosByProject[p.id] ?? 0 };
  }

  return (
    <>
      <Header title="Dashboard" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Link href="/projects" className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-[#4272EF]/30 transition-colors">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#4272EF]/[0.08]"><FolderOpen size={18} className="text-[#4272EF]" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{activeCount}</p><p className="text-xs text-gray-500">Active Projects</p></div>
          </Link>
          <Link href="/todos" className={`flex items-center gap-3 rounded-xl border p-4 transition-colors ${urgentTodos > 0 ? "border-red-200 bg-red-50/50 hover:border-red-300" : "border-gray-200 bg-white hover:border-[#4272EF]/30"}`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${urgentTodos > 0 ? "bg-red-100" : "bg-[#4272EF]/[0.08]"}`}><ClipboardList size={18} className={urgentTodos > 0 ? "text-red-500" : "text-[#4272EF]"} /></div>
            <div><p className="text-2xl font-bold text-gray-900">{openTodos}</p><p className="text-xs text-gray-500">{urgentTodos > 0 ? <span className="text-red-600 font-medium">{urgentTodos} urgent</span> : "Open To-Dos"}</p></div>
          </Link>
          <div className={`flex items-center gap-3 rounded-xl border p-4 ${totalAlerts > 0 ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-white"}`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${totalAlerts > 0 ? "bg-amber-100" : "bg-[#4272EF]/[0.08]"}`}><AlertTriangle size={18} className={totalAlerts > 0 ? "text-amber-600" : "text-[#4272EF]"} /></div>
            <div><p className="text-2xl font-bold text-gray-900">{totalAlerts}</p><p className="text-xs text-gray-500">Needs Attention</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#4272EF]/[0.08]"><FileText size={18} className="text-[#4272EF]" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{fmt(outstandingAP)}</p><p className="text-xs text-gray-500">AP Outstanding</p></div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {hasWeeklyActivity && (
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Calendar size={16} className="text-[#4272EF]" /><h2 className="font-semibold text-gray-900">This Week</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {thisWeekStages.slice(0, 6).map((s) => {
                    const isStart = s.planned_start_date && s.planned_start_date >= today && s.planned_start_date <= weekStr;
                    return (
                      <Link key={s.id} href={`/projects/${s.project_id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-[#4272EF]/[0.06] flex items-center justify-center"><Hammer size={14} className="text-[#4272EF]" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.stage_name}</p>
                          <p className="text-xs text-gray-400">{projectNames[s.project_id] ?? "Unknown"} &middot; {isStart ? "Starts" : "Completes"} {fmtDate((isStart ? s.planned_start_date : s.planned_end_date) ?? today)}</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isStart ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>{isStart ? "Starting" : "Completing"}</span>
                      </Link>
                    );
                  })}
                  {todosDueThisWeek.slice(0, 3).map((t) => (
                    <Link key={t.id} href="/todos" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.priority === "urgent" ? "bg-red-50" : "bg-amber-50"}`}><ClipboardList size={14} className={t.priority === "urgent" ? "text-red-500" : "text-amber-500"} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.description}</p>
                        <p className="text-xs text-gray-400">{projectNames[t.project_id ?? ""] ?? "General"} &middot; Due {fmtDate(t.due_date!)}</p>
                      </div>
                      {t.priority === "urgent" && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">Urgent</span>}
                    </Link>
                  ))}
                  {invoicesDueThisWeek.slice(0, 3).map((inv) => (
                    <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><FileText size={14} className="text-gray-500" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{inv.vendor ?? "Invoice"} {inv.invoice_number ? `#${inv.invoice_number}` : ""}</p>
                        <p className="text-xs text-gray-400">{projectNames[inv.project_id ?? ""] ?? "G&A"} &middot; Due {fmtDate(inv.due_date!)}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{fmt(inv.total_amount ?? inv.amount ?? 0)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {allProjects.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
                <FolderOpen size={48} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm mb-4">No active projects yet.</p>
                <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-white px-4 py-2 rounded-lg bg-[#4272EF] hover:bg-[#3461de]">Create your first project <ArrowRight size={14} /></Link>
              </div>
            ) : (
              <>
                {Object.entries(subdivisions).map(([subName, subProjects]) => (
                  <div key={subName}>
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin size={14} className="text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{subName}</h3>
                      <span className="text-xs text-gray-400">{subProjects.length} home{subProjects.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {subProjects.map((p) => <ProjectCard key={p.id} {...cardProps(p)} />)}
                    </div>
                  </div>
                ))}
                {noSubdivision.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3"><HardHat size={14} className="text-gray-400" /><h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Home Construction</h3></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{noSubdivision.map((p) => <ProjectCard key={p.id} {...cardProps(p)} />)}</div>
                  </div>
                )}
                {landProjects.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3"><TreePine size={14} className="text-gray-400" /><h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Land Development</h3></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{landProjects.map((p) => <ProjectCard key={p.id} {...cardProps(p)} />)}</div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {totalAlerts > 0 && (
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Needs Attention</h2></div>
                <div className="divide-y divide-gray-50">
                  {pastDueInvoices > 0 && <Link href="/invoices" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"><AlertTriangle size={15} className="text-red-500 shrink-0" /><span className="text-sm text-gray-700 flex-1">{pastDueInvoices} past-due invoice{pastDueInvoices !== 1 ? "s" : ""}</span><ChevronRight size={14} className="text-gray-300" /></Link>}
                  {pendingInvoices > 0 && <Link href="/invoices?status=pending_review" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"><FileText size={15} className="text-amber-500 shrink-0" /><span className="text-sm text-gray-700 flex-1">{pendingInvoices} invoice{pendingInvoices !== 1 ? "s" : ""} to review</span><ChevronRight size={14} className="text-gray-300" /></Link>}
                  {expiringVendors.length > 0 && <Link href="/vendors" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"><Truck size={15} className="text-amber-500 shrink-0" /><span className="text-sm text-gray-700 flex-1">{expiringVendors.length} vendor COI/license expiring</span><ChevronRight size={14} className="text-gray-300" /></Link>}
                  {urgentTodos > 0 && <Link href="/todos" className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"><AlertCircle size={15} className="text-red-500 shrink-0" /><span className="text-sm text-gray-700 flex-1">{urgentTodos} urgent to-do{urgentTodos !== 1 ? "s" : ""}</span><ChevronRight size={14} className="text-gray-300" /></Link>}
                  {overBudgetProjects.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"><AlertTriangle size={15} className="text-amber-500 shrink-0" /><span className="text-sm text-gray-700 flex-1 truncate">{p.name} over budget</span><ChevronRight size={14} className="text-gray-300" /></Link>)}
                </div>
              </div>
            )}

            {(recentLogs ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"><h2 className="font-semibold text-gray-900">Recent Field Logs</h2><Link href="/field-logs" className="text-sm font-medium text-[#4272EF]">View all</Link></div>
                <div className="divide-y divide-gray-50">
                  {(recentLogs ?? []).map((log) => (
                    <div key={log.id} className="px-5 py-3">
                      <div className="flex items-center gap-2 mb-0.5"><span className="text-xs font-medium text-[#4272EF]">{projectNames[log.project_id] ?? "\u2014"}</span><span className="text-xs text-gray-400">{fmtDate(log.log_date)}</span></div>
                      <p className="text-sm text-gray-700 line-clamp-2">{log.notes}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900">Quick Actions</h2></div>
              <div className="p-3 grid grid-cols-2 gap-2">
                {[{ href: "/invoices/upload", label: "New Invoice", icon: <FileText size={15} /> }, { href: "/field-logs", label: "Field Log", icon: <ClipboardList size={15} /> }, { href: "/projects", label: "Projects", icon: <FolderOpen size={15} /> }, { href: "/draws", label: "Draws", icon: <Calendar size={15} /> }].map(({ href, label, icon }) => (
                  <Link key={href} href={href} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors border border-gray-100"><span className="text-[#4272EF]">{icon}</span>{label}</Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
