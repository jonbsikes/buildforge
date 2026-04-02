import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { FileText, AlertCircle, Clock, CheckCircle2, XCircle, Upload } from "lucide-react";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Project = Pick<Database["public"]["Tables"]["projects"]["Row"], "id" | "name">;
type CostCode = Pick<Database["public"]["Tables"]["cost_codes"]["Row"], "code" | "description">;

function fmt(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function agingBucket(due: string | null): "current" | "30" | "60" | "90plus" {
  if (!due) return "current";
  const days = Math.floor((Date.now() - new Date(due).getTime()) / 86400000);
  if (days <= 0) return "current";
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  return "90plus";
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending_review: { label: "Pending Review", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-700" },
  scheduled: { label: "Scheduled", color: "bg-violet-100 text-violet-700" },
  paid: { label: "Paid", color: "bg-green-100 text-green-700" },
  disputed: { label: "Disputed", color: "bg-red-100 text-red-700" },
};

const tabs = [
  { key: "all", label: "All" },
  { key: "pending_review", label: "Pending Review" },
  { key: "approved", label: "Approved" },
  { key: "scheduled", label: "Scheduled" },
  { key: "paid", label: "Paid" },
  { key: "disputed", label: "Disputed" },
] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [invoicesRes, projectsRes, costCodesRes] = await Promise.all([
    supabase.from("invoices").select("*").order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name"),
    supabase.from("cost_codes").select("code, description").order("code"),
  ]);

  const allInvoices = (invoicesRes.data ?? []) as Invoice[];
  const projects = (projectsRes.data ?? []) as Project[];
  const costCodes = (costCodesRes.data ?? []) as CostCode[];
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const codeMap = Object.fromEntries(costCodes.map((c) => [c.code, c.description]));

  const activeFilter = params.status ?? "all";
  const invoices =
    activeFilter === "all"
      ? allInvoices
      : allInvoices.filter((i) => i.status === activeFilter);

  const counts: Record<string, number> = {
    all: allInvoices.length,
    pending_review: allInvoices.filter((i) => i.status === "pending_review").length,
    approved: allInvoices.filter((i) => i.status === "approved").length,
    scheduled: allInvoices.filter((i) => i.status === "scheduled").length,
    paid: allInvoices.filter((i) => i.status === "paid").length,
    disputed: allInvoices.filter((i) => i.status === "disputed").length,
  };

  // AP aging totals (unpaid only)
  const unpaid = allInvoices.filter((i) => i.status !== "paid");
  const aging = {
    current: unpaid.filter((i) => agingBucket(i.due_date) === "current").reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0),
    "30": unpaid.filter((i) => agingBucket(i.due_date) === "30").reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0),
    "60": unpaid.filter((i) => agingBucket(i.due_date) === "60").reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0),
    "90plus": unpaid.filter((i) => agingBucket(i.due_date) === "90plus").reduce((s, i) => s + (i.amount ?? i.total_amount ?? 0), 0),
  };

  return (
    <>
      <Header title="Accounts Payable" />
      <main className="flex-1 p-6 overflow-auto">
        {/* AP Aging */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Current", value: aging.current, color: "text-gray-900" },
            { label: "1–30 Days Overdue", value: aging["30"], color: "text-amber-600" },
            { label: "31–60 Days Overdue", value: aging["60"], color: "text-orange-600" },
            { label: "60+ Days Overdue", value: aging["90plus"], color: "text-red-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{fmt(value)}</p>
            </div>
          ))}
        </div>

        {/* Tabs + action */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
            {tabs.map(({ key, label }) => (
              <Link
                key={key}
                href={`/invoices?status=${key}`}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeFilter === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
                <span className={`ml-1.5 text-xs ${activeFilter === key ? "text-gray-500" : "text-gray-400"}`}>
                  {counts[key] ?? 0}
                </span>
              </Link>
            ))}
          </div>
          <Link
            href="/invoices/upload"
            className="inline-flex items-center gap-2 bg-amber-500 text-gray-900 font-medium px-4 py-2 rounded-lg text-sm hover:bg-amber-400 transition-colors"
          >
            <Upload size={15} />
            Upload Invoice
          </Link>
        </div>

        {/* Invoice table */}
        <div className="bg-white rounded-xl border border-gray-200">
          {invoices.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <FileText size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {activeFilter !== "all"
                  ? `No invoices with status "${activeFilter.replace("_", " ")}".`
                  : "No invoices yet."}
              </p>
              <Link href="/invoices/upload" className="mt-2 inline-block text-sm text-amber-600 hover:underline">
                Upload your first invoice
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Vendor</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Project</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Cost Code</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Invoice #</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Due</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-400 uppercase">Amount</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">AI</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoices.map((inv) => {
                    const s = statusConfig[inv.status] ?? statusConfig.pending_review;
                    const overdue =
                      inv.due_date && inv.status !== "paid" && new Date(inv.due_date) < new Date();
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900">
                            {inv.vendor ?? <span className="text-gray-400 italic">Unknown vendor</span>}
                          </div>
                          <div className="text-xs text-gray-400 truncate max-w-[140px]">{inv.file_name}</div>
                        </td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{projectMap[inv.project_id] ?? "—"}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {inv.cost_code ? `${inv.cost_code} — ${codeMap[inv.cost_code] ?? ""}` : "—"}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{inv.invoice_number ?? "—"}</td>
                        <td className={`px-5 py-3 text-xs ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                          {overdue && <AlertCircle size={12} className="inline mr-1" />}
                          {fmtDate(inv.due_date)}
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">
                          {fmt(inv.amount ?? inv.total_amount)}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
                            {inv.status === "paid" ? <CheckCircle2 size={11} /> :
                             inv.status === "disputed" ? <XCircle size={11} /> :
                             <Clock size={11} />}
                            {s.label}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {inv.ai_confidence && (
                            <span className={`text-xs font-medium capitalize ${
                              inv.ai_confidence === "high" ? "text-green-600" :
                              inv.ai_confidence === "medium" ? "text-amber-600" : "text-red-600"
                            }`}>
                              {inv.ai_confidence}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link href={`/invoices/${inv.id}`} className="text-xs text-amber-600 hover:underline font-medium">
                            Review →
                          </Link>
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
