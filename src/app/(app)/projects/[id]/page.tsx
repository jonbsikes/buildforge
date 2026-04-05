import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Landmark, MapPin, Calendar, Home, Ruler, Pencil } from "lucide-react";
import ProjectTabs from "@/components/projects/ProjectTabs";
import DeleteProjectButton from "@/components/projects/DeleteProjectButton";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_COLOR: Record<string, string> = {
  planning:  "bg-gray-100 text-gray-700",
  active:    "bg-green-100 text-green-700",
  on_hold:   "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-600",
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

  // Parallel fetch everything
  const [
    projectResult,
    phasesResult,
    costCodesResult,
    stagesResult,
    documentsResult,
    allMasterCodesResult,
    contractsResult,
    invoicesResult,
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
      .from("invoices")
      .select("cost_code_id, amount, total_amount")
      .eq("project_id", id)
      .in("status", ["approved", "scheduled", "released", "cleared"]),
  ]);

  if (!projectResult.data) notFound();
  const project = projectResult.data;
  const isHome = project.project_type === "home_construction";
  const lender = project.contacts as { id: string; name: string } | null;

  const phases = phasesResult.data ?? [];
  const totalSoldLots = phases.reduce((s, p) => s + (p.lots_sold ?? 0), 0);
  const remainingLots = (project.number_of_lots ?? 0) - totalSoldLots;

  // Filter cost codes: exclude G&A (null project_type), keep type-matched only
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
      if (!cc || !cc.project_type) return null; // skip G&A
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

  // All master cost codes for this project type (excluding G&A)
  const projectTypeName = isHome ? "home_construction" : "land_development";
  const enabledCodes = new Set(costCodes.map((c) => c.code));
  const availableCostCodes = (allMasterCodesResult.data ?? [])
    .filter((c) => c.project_type === projectTypeName && !enabledCodes.has(c.code))
    .map((c) => ({ id: c.id, code: c.code, name: c.name, category: c.category, sort_order: c.sort_order }));

  // Aggregate committed (contracts) and actual (invoices) by cost_code_id
  const committedByCostCodeId: Record<string, number> = {};
  for (const c of contractsResult.data ?? []) {
    if (c.cost_code_id) {
      committedByCostCodeId[c.cost_code_id] = (committedByCostCodeId[c.cost_code_id] ?? 0) + (c.amount ?? 0);
    }
  }
  const actualByCostCodeId: Record<string, number> = {};
  for (const inv of invoicesResult.data ?? []) {
    if (inv.cost_code_id) {
      const amt = inv.total_amount ?? inv.amount ?? 0;
      actualByCostCodeId[inv.cost_code_id] = (actualByCostCodeId[inv.cost_code_id] ?? 0) + amt;
    }
  }

  const days = daysUnderConstruction(project.start_date);

  return (
    <>
      <Header title={project.name} />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-5">
          <Link
            href="/projects"
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Projects
          </Link>

          {/* Project header card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isHome ? "bg-blue-50" : "bg-emerald-50"}`}>
                  {isHome
                    ? <Building2 size={20} className="text-[#4272EF]" />
                    : <Landmark size={20} className="text-emerald-600" />
                  }
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">{project.name}</h1>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {isHome ? "Home Construction" : "Land Development"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[project.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {project.status.replace(/_/g, " ")}
                </span>
                <Link
                  href={`/projects/${id}/edit`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-[#4272EF] hover:bg-blue-50 border border-gray-200 rounded-lg transition-colors"
                >
                  <Pencil size={13} />
                  Edit
                </Link>
                <DeleteProjectButton projectId={id} projectName={project.name} />
              </div>
            </div>

            {/* Fields grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4 text-sm">
              {project.address && (
                <DetailField icon={<MapPin size={13} />} label="Address" value={project.address} wide />
              )}
              {project.start_date && (
                <DetailField icon={<Calendar size={13} />} label="Start Date" value={
                  new Date(project.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                } />
              )}
              {days !== null && (
                <DetailField label="Days Under Construction" value={`${days.toLocaleString()} days`} highlight />
              )}
              {lender && (
                <DetailField label="Lender" value={lender.name} />
              )}

              {/* Home Construction */}
              {isHome && project.subdivision && <DetailField label="Subdivision" value={project.subdivision} />}
              {isHome && (project.block || project.lot) && (
                <DetailField label="Block / Lot" value={[project.block, project.lot].filter(Boolean).join(" / ")} />
              )}
              {isHome && project.lot_size_acres != null && (
                <DetailField icon={<Ruler size={13} />} label="Lot Size" value={`${project.lot_size_acres} acres`} />
              )}
              {isHome && project.plan && <DetailField label="Plan" value={project.plan} />}
              {isHome && project.home_size_sf != null && (
                <DetailField icon={<Home size={13} />} label="Home Size" value={`${project.home_size_sf.toLocaleString()} SF`} />
              )}

              {/* Land Development */}
              {!isHome && project.size_acres != null && (
                <DetailField label="Size" value={`${project.size_acres} acres`} />
              )}
              {!isHome && project.number_of_lots != null && (
                <DetailField label="Total Lots" value={String(project.number_of_lots)} />
              )}
              {!isHome && (
                <DetailField label="Lots Sold" value={String(totalSoldLots)} />
              )}
              {!isHome && project.number_of_lots != null && (
                <DetailField label="Remaining Lots" value={String(remainingLots >= 0 ? remainingLots : 0)} />
              )}
              {!isHome && project.number_of_phases != null && (
                <DetailField label="Phases" value={String(project.number_of_phases)} />
              )}
            </div>
          </div>

          {/* Tabs */}
          <ProjectTabs
            projectId={id}
            isHome={isHome}
            startDate={project.start_date}
            buildStages={buildStages}
            costCodes={costCodes}
            availableCostCodes={availableCostCodes}
            phases={phases}
            documents={documents}
            committedByCostCodeId={committedByCostCodeId}
            actualByCostCodeId={actualByCostCodeId}
          />
        </div>
      </main>
    </>
  );
}

function DetailField({
  label,
  value,
  icon,
  wide,
  highlight,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  wide?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className={`text-sm font-medium ${highlight ? "text-[#4272EF]" : "text-gray-800"}`}>
        {value}
      </p>
    </div>
  );
}
