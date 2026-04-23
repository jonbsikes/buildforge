import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2, Landmark, MapPin, Calendar, Home, Ruler, Pencil, ArrowRight,
  ChevronLeft, Clock, HardHat,
} from "lucide-react";
import ProjectTabs from "@/components/projects/ProjectTabs";
import DeleteProjectButton from "@/components/projects/DeleteProjectButton";
import ProgressRing from "@/components/ui/ProgressRing";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_COLOR: Record<string, string> = {
  planning:       "bg-gray-100 text-gray-700",
  active:         "bg-green-100 text-green-700",
  pre_construction: "bg-gray-100 text-gray-600",
  on_hold:        "bg-amber-100 text-amber-700",
  completed:      "bg-blue-100 text-blue-700",
  cancelled:      "bg-red-100 text-red-600",
};

function daysUnderConstruction(startDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    projectResult,
    phasesResult,
    costCodesResult,
    stagesResult,
    documentsResult,
    allMasterCodesResult,
    contractsResult,
    invoicesResult,
    jeLinesResult,
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(`
        id, name, address, status, project_type,
        subdivision, block, lot, lot_size_acres, plan, home_size_sf,
        size_acres, number_of_lots, number_of_phases,
        start_date, lender_id,
        contacts ( id, name )
      `)
      .eq("id", id)
      .single(),

    supabase
      .from("project_phases")
      .select("id, phase_number, name, size_acres, number_of_lots, lots_sold, status, notes")
      .eq("project_id", id)
      .order("phase_number"),

    supabase
      .from("project_cost_codes")
      .select(`
        id, budgeted_amount,
        cost_codes ( id, code, name, category, project_type, sort_order )
      `)
      .eq("project_id", id),

    supabase
      .from("build_stages")
      .select("id, stage_number, stage_name, track, status, planned_start_date, planned_end_date, actual_start_date, actual_end_date, baseline_start_date, baseline_end_date, notes")
      .eq("project_id", id)
      .order("stage_number"),

    supabase
      .from("documents")
      .select("id, folder, file_name, storage_path, file_size_kb, mime_type, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),

    supabase
      .from("cost_codes")
      .select("id, code, name, category, project_type, sort_order")
      .order("code"),

    supabase
      .from("contracts")
      .select("cost_code_id, amount")
      .eq("project_id", id),

    supabase
      .from("invoice_line_items")
      .select("cost_code, amount, invoices!inner ( status )")
      .eq("project_id", id)
      .in("invoices.status", ["approved", "released", "cleared"]),

    supabase
      .from("journal_entry_lines")
      .select("cost_code_id, debit, credit, journal_entries!inner ( status, source_type )")
      .eq("project_id", id)
      .not("cost_code_id", "is", null) as unknown as Promise<{ data: { cost_code_id: string | null; debit: number; credit: number; journal_entries: { status: string; source_type: string } }[] | null; error: unknown }>,
  ]);

  if (!projectResult.data) notFound();
  const project = projectResult.data;
  const isHome = project.project_type === "home_construction";
  const lender = project.contacts as { id: string; name: string } | null;

  const phases = phasesResult.data ?? [];
  const totalSoldLots = phases.reduce((s, p) => s + (p.lots_sold ?? 0), 0);
  const remainingLots = (project.number_of_lots ?? 0) - totalSoldLots;

  type CostCodeRow = {
    id: string;
    pccId: string;
    budgeted_amount: number;
    code: string;
    name: string;
    category: string;
    sort_order: number | null;
  };

  const costCodes: CostCodeRow[] = (costCodesResult.data ?? [])
    .map((pcc) => {
      const cc = pcc.cost_codes as {
        id: string; code: string; name: string;
        category: string; project_type: string | null; sort_order: number | null;
      } | null;
      if (!cc || !cc.project_type) return null;
      if (isHome && cc.project_type !== "home_construction") return null;
      if (!isHome && cc.project_type !== "land_development") return null;
      return {
        id: cc.id,
        pccId: pcc.id,
        budgeted_amount: pcc.budgeted_amount,
        code: cc.code,
        name: cc.name,
        category: cc.category,
        sort_order: cc.sort_order,
      };
    })
    .filter((r): r is CostCodeRow => r !== null)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));

  const buildStages = stagesResult.data ?? [];
  const documents = documentsResult.data ?? [];

  const projectTypeName = isHome ? "home_construction" : "land_development";
  const enabledCodes = new Set(costCodes.map((c) => c.code));
  const availableCostCodes = (allMasterCodesResult.data ?? [])
    .filter((c) => c.project_type === projectTypeName && !enabledCodes.has(c.code))
    .map((c) => ({ id: c.id, code: c.code, name: c.name, category: c.category, sort_order: c.sort_order }));

  const committedByCostCodeId: Record<string, number> = {};
  for (const c of contractsResult.data ?? []) {
    if (c.cost_code_id) {
      committedByCostCodeId[c.cost_code_id] = (committedByCostCodeId[c.cost_code_id] ?? 0) + (c.amount ?? 0);
    }
  }
  // Build cost code number → UUID lookup
  const codeNumToUuid: Record<string, string> = {};
  for (const cc of allMasterCodesResult.data ?? []) {
    codeNumToUuid[cc.code] = cc.id;
  }

  const actualByCostCodeId: Record<string, number> = {};
  for (const li of invoicesResult.data ?? []) {
    if (li.cost_code) {
      const ccId = codeNumToUuid[li.cost_code] ?? li.cost_code;
      const amt = li.amount ?? 0;
      actualByCostCodeId[ccId] = (actualByCostCodeId[ccId] ?? 0) + amt;
    }
  }

  for (const line of jeLinesResult.data ?? []) {
    const je = line.journal_entries as { status: string; source_type: string } | null | undefined;
    if (!je || je.status !== "posted") continue;
    if (je.source_type === "invoice_approval" || je.source_type === "invoice_payment") continue;
    const ccId = line.cost_code_id as string;
    if (!ccId) continue;
    const amt = (line.debit ?? 0) - (line.credit ?? 0);
    if (amt !== 0) {
      actualByCostCodeId[ccId] = (actualByCostCodeId[ccId] ?? 0) + amt;
    }
  }

  const days = daysUnderConstruction(project.start_date);

  // Stage progress
  const activeStages = buildStages.filter((s) => s.status !== "skipped");
  const completedStages = activeStages.filter((s) => s.status === "complete" || s.status === "completed").length;
  const stageProgress = activeStages.length > 0 ? Math.round((completedStages / activeStages.length) * 100) : 0;

  // Budget progress
  const totalBudget = costCodes.reduce((s, c) => s + (c.budgeted_amount ?? 0), 0);
  const totalActual = Object.values(actualByCostCodeId).reduce((s, v) => s + v, 0);

  // What's Next
  const tracks = ["Exterior", "Interior"] as const;
  const whatsNextItems: { stage: typeof buildStages[number]; type: "in_progress" | "next" }[] = [];
  for (const track of tracks) {
    const trackStages = buildStages.filter((s) => s.track === track && s.status !== "skipped");
    const inProgress = trackStages.find((s) => s.status === "in_progress");
    if (inProgress) whatsNextItems.push({ stage: inProgress, type: "in_progress" });
    const next = trackStages.find((s) => s.status === "not_started");
    if (next) whatsNextItems.push({ stage: next, type: "next" });
  }
  const noTrackStages = buildStages.filter((s) => !s.track && s.status !== "skipped");
  const noTrackInProgress = noTrackStages.find((s) => s.status === "in_progress");
  if (noTrackInProgress) whatsNextItems.push({ stage: noTrackInProgress, type: "in_progress" });
  const noTrackNext = noTrackStages.find((s) => s.status === "not_started");
  if (noTrackNext) whatsNextItems.push({ stage: noTrackNext, type: "next" });
  const showWhatsNext = whatsNextItems.length > 0;

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  return (
    <>
      <Header title={project.name} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto">

          {/* MOBILE HEADER */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <Link href="/projects" className="flex items-center gap-1 text-sm text-gray-500 active:text-gray-700 min-h-[44px]">
                <ChevronLeft size={18} />
                Projects
              </Link>
              <div className="flex items-center gap-2">
                <Link href={`/projects/${id}/edit`} className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 active:bg-gray-200 transition-colors">
                  <Pencil size={15} className="text-gray-600" />
                </Link>
              </div>
            </div>

            <div className="px-4 pb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isHome ? "bg-blue-50" : "bg-emerald-50"}`}>
                  {isHome ? <Building2 size={20} className="text-[#4272EF]" /> : <Landmark size={20} className="text-emerald-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-bold text-gray-900 truncate">{project.name}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[project.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {project.status.replace(/_/g, " ")}
                    </span>
                    {project.subdivision && <span className="text-xs text-gray-400">{project.subdivision}</span>}
                  </div>
                </div>
                {activeStages.length > 0 && <ProgressRing progress={stageProgress} size={48} strokeWidth={4} />}
              </div>

              <div className="flex gap-3 mt-3 overflow-x-auto no-scrollbar">
                {days !== null && (
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg border border-gray-100 shrink-0">
                    <Clock size={13} className="text-[#4272EF]" />
                    <span className="text-xs font-semibold text-gray-900 tabular-nums">{days}</span>
                    <span className="text-xs text-gray-400">days</span>
                  </div>
                )}
                {totalBudget > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg border border-gray-100 shrink-0">
                    <span className="text-xs text-gray-400">Spent</span>
                    <span className="text-xs font-semibold text-gray-900 tabular-nums">{fmtCurrency(totalActual)}</span>
                    <span className="text-xs text-gray-400">/ {fmtCurrency(totalBudget)}</span>
                  </div>
                )}
                {isHome && project.plan && (
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg border border-gray-100 shrink-0">
                    <HardHat size={13} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-700">{project.plan}</span>
                  </div>
                )}
                {isHome && project.home_size_sf != null && (
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg border border-gray-100 shrink-0">
                    <Home size={13} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-700">{project.home_size_sf.toLocaleString()} SF</span>
                  </div>
                )}
                {!isHome && project.number_of_lots != null && (
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg border border-gray-100 shrink-0">
                    <span className="text-xs font-semibold text-gray-900 tabular-nums">{totalSoldLots}/{project.number_of_lots}</span>
                    <span className="text-xs text-gray-400">lots sold</span>
                  </div>
                )}
              </div>
            </div>

            {showWhatsNext && (
              <div className="px-4 pb-4">
                <div className="space-y-2">
                  {whatsNextItems.map((item) => {
                    const s = item.stage;
                    const trackLabel = s.track ?? "";
                    if (item.type === "in_progress") {
                      return (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-3.5 bg-blue-50 border border-blue-100 rounded-xl active:bg-blue-100 transition-colors">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#4272EF] shrink-0 animate-pulse" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-blue-800 font-semibold">{s.stage_name}</span>
                            {trackLabel && <span className="ml-2 text-[10px] text-blue-400 bg-blue-100 px-1.5 py-0.5 rounded">{trackLabel}</span>}
                          </div>
                          <span className="text-xs text-blue-400 font-medium shrink-0">In progress</span>
                        </div>
                      );
                    }
                    return (
                      <div key={s.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-xl">
                        <ArrowRight size={14} className="text-gray-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-700 font-medium">{s.stage_name}</span>
                          {trackLabel && <span className="ml-2 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{trackLabel}</span>}
                        </div>
                        {s.planned_start_date && (
                          <span className="text-xs text-gray-400 shrink-0">
                            {new Date(s.planned_start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="px-4 pb-6">
              <ProjectTabs projectId={id} isHome={isHome} startDate={project.start_date} buildStages={buildStages} costCodes={costCodes} availableCostCodes={availableCostCodes} phases={phases} documents={documents} committedByCostCodeId={committedByCostCodeId} actualByCostCodeId={actualByCostCodeId} />
            </div>
          </div>

          {/* DESKTOP LAYOUT */}
          <div className="hidden lg:block p-6 space-y-5">
            <Link href="/projects" className="text-sm text-gray-400 hover:text-gray-600 transition-colors inline-flex items-center gap-1">
              <ChevronLeft size={14} />
              Projects
            </Link>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isHome ? "bg-blue-50" : "bg-emerald-50"}`}>
                    {isHome ? <Building2 size={22} className="text-[#4272EF]" /> : <Landmark size={22} className="text-emerald-600" />}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {isHome ? "Home Construction" : "Land Development"}
                      {project.subdivision && ` \u2014 ${project.subdivision}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[project.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {project.status.replace(/_/g, " ")}
                  </span>
                  <Link href={`/projects/${id}/edit`} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-[#4272EF] hover:bg-blue-50 border border-gray-200 rounded-lg transition-colors">
                    <Pencil size={13} />
                    Edit
                  </Link>
                  <DeleteProjectButton projectId={id} projectName={project.name} />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4 text-sm">
                {project.address && <DetailField icon={<MapPin size={13} />} label="Address" value={project.address} wide />}
                {project.start_date && (
                  <DetailField icon={<Calendar size={13} />} label="Start Date" value={new Date(project.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} />
                )}
                {days !== null && <DetailField label="Days Under Construction" value={`${days.toLocaleString()} days`} highlight />}
                {lender && <DetailField label="Lender" value={lender.name} />}
                {isHome && project.subdivision && <DetailField label="Subdivision" value={project.subdivision} />}
                {isHome && (project.block || project.lot) && <DetailField label="Block / Lot" value={[project.block, project.lot].filter(Boolean).join(" / ")} />}
                {isHome && project.lot_size_acres != null && <DetailField icon={<Ruler size={13} />} label="Lot Size" value={`${project.lot_size_acres} acres`} />}
                {isHome && project.plan && <DetailField label="Plan" value={project.plan} />}
                {isHome && project.home_size_sf != null && <DetailField icon={<Home size={13} />} label="Home Size" value={`${project.home_size_sf.toLocaleString()} SF`} />}
                {!isHome && project.size_acres != null && <DetailField label="Size" value={`${project.size_acres} acres`} />}
                {!isHome && project.number_of_lots != null && <DetailField label="Total Lots" value={String(project.number_of_lots)} />}
                {!isHome && <DetailField label="Lots Sold" value={String(totalSoldLots)} />}
                {!isHome && project.number_of_lots != null && <DetailField label="Remaining Lots" value={String(remainingLots >= 0 ? remainingLots : 0)} />}
                {!isHome && project.number_of_phases != null && <DetailField label="Phases" value={String(project.number_of_phases)} />}
              </div>
            </div>

            {showWhatsNext && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">{"What's Next"}</h2>
                <div className="grid grid-cols-2 gap-2">
                  {whatsNextItems.map((item) => {
                    const s = item.stage;
                    const trackLabel = s.track ?? "";
                    if (item.type === "in_progress") {
                      return (
                        <div key={s.id} className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                          <div className="w-2 h-2 rounded-full bg-[#4272EF] shrink-0" />
                          <span className="text-sm text-blue-700 font-medium">{s.stage_name}</span>
                          {trackLabel && <span className="text-[10px] text-blue-400 bg-blue-100 px-1.5 py-0.5 rounded">{trackLabel}</span>}
                          <span className="text-xs text-blue-400 ml-auto">In progress</span>
                        </div>
                      );
                    }
                    return (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-lg">
                        <ArrowRight size={14} className="text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 font-medium">{s.stage_name}</span>
                        {trackLabel && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{trackLabel}</span>}
                        {s.planned_start_date && (
                          <span className="text-xs text-gray-400 ml-auto">
                            Starts {new Date(s.planned_start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <ProjectTabs projectId={id} isHome={isHome} startDate={project.start_date} buildStages={buildStages} costCodes={costCodes} availableCostCodes={availableCostCodes} phases={phases} documents={documents} committedByCostCodeId={committedByCostCodeId} actualByCostCodeId={actualByCostCodeId} />
          </div>

        </div>
      </main>
    </>
  );
}

function DetailField({ label, value, icon, wide, highlight }: {
  label: string; value: string; icon?: React.ReactNode; wide?: boolean; highlight?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1">{icon}{label}</p>
      <p className={`text-sm font-medium ${highlight ? "text-[#4272EF]" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}
