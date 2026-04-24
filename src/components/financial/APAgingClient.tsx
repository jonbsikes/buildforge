"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Info } from "lucide-react";
import Link from "next/link";
import ReportChrome from "@/components/ui/ReportChrome";
import StatusDot from "@/components/ui/StatusDot";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}/${y}`;
}

type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

interface AgingRow {
  id: string;
  vendor: string;
  invoice_number: string;
  project: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  days_outstanding: number;
  bucket: AgingBucket;
  status: string;
}

interface OutstandingCheck {
  id: string;
  vendor_name: string;
  check_number: string | null;
  amount: number;
  payment_date: string | null;
  draw_id: string;
  draw_date: string | null;
  days_outstanding: number;
}

function getBucket(dueDate: string): AgingBucket {
  const today = new Date();
  const due = new Date(dueDate);
  const daysPastDue = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

const BUCKET_LABELS: Record<AgingBucket, string> = {
  "current": "Current", "1-30": "1–30 Days", "31-60": "31–60 Days", "61-90": "61–90 Days", "90+": "90+ Days",
};

const BUCKET_BAR_BG: Record<AgingBucket, string> = {
  "current": "var(--status-complete)", "1-30": "var(--status-warning)",
  "31-60": "var(--status-delayed)", "61-90": "var(--status-over)", "90+": "var(--status-over)",
};
const BUCKET_HEADER_STYLE: Record<AgingBucket, { bg: string; text: string }> = {
  "current": { bg: "var(--tint-complete)", text: "var(--status-complete)" },
  "1-30":    { bg: "var(--tint-warning)",  text: "#92400E" },
  "31-60":   { bg: "var(--tint-delayed)",  text: "#9A3412" },
  "61-90":   { bg: "var(--tint-over)",     text: "var(--status-over)" },
  "90+":     { bg: "var(--tint-over)",     text: "var(--status-over)" },
};

export default function APAgingClient() {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [outstandingChecks, setOutstandingChecks] = useState<OutstandingCheck[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const today = new Date().toISOString().split("T")[0];

      // Load unpaid/pending invoices for AP aging
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, vendor, invoice_number, invoice_date, due_date, amount, status, project_id, projects(id, name)")
        .in("status", ["pending_review", "approved"])
        .order("due_date");

      const list = invoices ?? [];

      const agingRows: AgingRow[] = list.map(inv => {
        const project = inv.projects as { id: string; name: string } | null;
        const invoiceDate = inv.invoice_date ?? today;
        const dueDate = inv.due_date ?? today;
        const daysOutstanding = Math.max(0, Math.floor((new Date().getTime() - new Date(invoiceDate).getTime()) / 86400000));

        return {
          id: inv.id,
          vendor: inv.vendor ?? "Unknown Vendor",
          invoice_number: inv.invoice_number ?? "—",
          project: project?.name ?? "No Project",
          invoice_date: invoiceDate,
          due_date: dueDate,
          amount: inv.amount ?? 0,
          days_outstanding: daysOutstanding,
          bucket: getBucket(dueDate),
          status: inv.status,
        };
      });

      // Load outstanding (written but not cashed) checks
      // These are vendor_payments that are still "pending" after a draw is funded
      // (check written but not yet confirmed as deposited/cashed)
      const { data: pendingPayments } = await supabase
        .from("vendor_payments")
        .select(`
          id, vendor_name, amount, check_number, payment_date, status,
          loan_draws ( id, draw_date )
        `)
        .eq("status", "pending")
        .order("payment_date", { ascending: true });

      // Also include payments that have a check_number but not yet confirmed cleared
      const { data: writtenChecks } = await supabase
        .from("vendor_payments")
        .select(`
          id, vendor_name, amount, check_number, payment_date, status,
          loan_draws ( id, draw_date )
        `)
        .not("check_number", "is", null)
        .neq("status", "cleared")
        .order("payment_date", { ascending: true });

      const checksMap = new Map<string, OutstandingCheck>();

      // Merge: any check written (has check_number) that hasn't been confirmed cleared
      for (const p of writtenChecks ?? []) {
        if (checksMap.has(p.id)) continue;
        const draw = p.loan_draws as { id: string; draw_date: string | null } | null;
        const payDate = p.payment_date;
        const daysOut = payDate
          ? Math.max(0, Math.floor((new Date().getTime() - new Date(payDate).getTime()) / 86400000))
          : 0;
        checksMap.set(p.id, {
          id: p.id,
          vendor_name: p.vendor_name,
          check_number: p.check_number,
          amount: p.amount ?? 0,
          payment_date: p.payment_date,
          draw_id: draw?.id ?? "",
          draw_date: draw?.draw_date ?? null,
          days_outstanding: daysOut,
        });
      }

      const allVendors = [...new Set(agingRows.map(r => r.vendor))].sort();
      const { data: projectList } = await supabase.from("projects").select("id, name").order("name");

      setRows(agingRows);
      setOutstandingChecks(Array.from(checksMap.values()));
      setVendors(allVendors);
      setProjects(projectList ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (filterProject && r.project !== filterProject) return false;
    if (filterVendor && r.vendor !== filterVendor) return false;
    return true;
  }), [rows, filterProject, filterVendor]);

  const buckets: AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

  const bucketTotals = useMemo(() => {
    const totals: Record<AgingBucket, number> = { "current": 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    filtered.forEach(r => { totals[r.bucket] += r.amount; });
    return totals;
  }, [filtered]);

  const grandTotal = filtered.reduce((s, r) => s + r.amount, 0);
  const checksTotal = outstandingChecks.reduce((s, c) => s + c.amount, 0);

  const extraControls = (
    <>
      <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
        <option value="">All Projects</option>
        {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
      </select>
      <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
        <option value="">All Vendors</option>
        {vendors.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </>
  );

  return (
    <ReportChrome
      title="AP Aging"
      subtitle="Outstanding invoices by aging bucket"
      extraControls={extraControls}
      exportSlug="ap-aging"
    >
      <div className="space-y-8">
        {/* Aging bucket summary */}
        <div className="grid grid-cols-5 gap-3">
          {buckets.map(b => (
            <div key={b} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-2">{BUCKET_LABELS[b]}</p>
              <div className="flex items-center gap-2">
                <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: BUCKET_BAR_BG[b] }} />
                <p className="text-sm font-semibold text-gray-900">{fmt(bucketTotals[b])}</p>
              </div>
            </div>
          ))}
        </div>

        {/* AP Aging table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
            <h2 className="text-sm font-semibold text-white">
              Unpaid Invoices — {filtered.length} invoice{filtered.length !== 1 ? "s" : ""} · {fmt(grandTotal)} outstanding
            </h2>
          </div>

          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">No outstanding invoices.</div>
          ) : (
            <>
              {buckets.map(bucket => {
                const bucketRows = filtered.filter(r => r.bucket === bucket);
                if (bucketRows.length === 0) return null;
                const bucketTotal = bucketRows.reduce((s, r) => s + r.amount, 0);
                return (
                  <div key={bucket}>
                    <div
                      className="px-5 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide border-b border-gray-100"
                      style={{ backgroundColor: BUCKET_HEADER_STYLE[bucket].bg, color: BUCKET_HEADER_STYLE[bucket].text }}
                    >
                      <span>{BUCKET_LABELS[bucket]}</span>
                      <span>{fmt(bucketTotal)}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                            <th className="px-5 py-2 text-left">Vendor</th>
                            <th className="px-5 py-2 text-left">Invoice #</th>
                            <th className="px-5 py-2 text-left">Project</th>
                            <th className="px-5 py-2 text-left">Invoice Date</th>
                            <th className="px-5 py-2 text-left">Due Date</th>
                            <th className="px-5 py-2 text-right">Amount</th>
                            <th className="px-5 py-2 text-right">Days Out</th>
                            <th className="px-5 py-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bucketRows.map((row, idx) => (
                            <tr key={row.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? "bg-gray-50/50" : ""}`}>
                              <td className="px-5 py-2 font-medium text-gray-800">{row.vendor}</td>
                              <td className="px-5 py-2 text-gray-600">{row.invoice_number}</td>
                              <td className="px-5 py-2 text-gray-600">{row.project}</td>
                              <td className="px-5 py-2 text-gray-500">{fmtDate(row.invoice_date)}</td>
                              <td className="px-5 py-2 text-gray-500">{fmtDate(row.due_date)}</td>
                              <td className="px-5 py-2 text-right font-medium text-gray-800 tabular-nums">{fmtFull(row.amount)}</td>
                              <td className="px-5 py-2 text-right text-gray-600 tabular-nums">{row.days_outstanding}</td>
                              <td className="px-5 py-2">
                                <StatusDot status={row.status} />
                              </td>
                            </tr>
                          ))}
                          <tr className="border-b border-gray-100 bg-gray-50 font-semibold text-sm">
                            <td colSpan={5} className="px-5 py-2 text-gray-700">{BUCKET_LABELS[bucket]} Subtotal</td>
                            <td className="px-5 py-2 text-right text-gray-800 tabular-nums">{fmt(bucketTotal)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between items-center px-5 py-3 bg-gray-50 border-t border-gray-200 font-bold">
                <span className="text-gray-800">Total Outstanding</span>
                <span className="text-gray-900 text-base tabular-nums">{fmt(grandTotal)}</span>
              </div>
            </>
          )}
        </div>

        {/* Outstanding Vendor Obligations — Checks Written But Not Cashed */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Outstanding Vendor Obligations — Checks Written, Not Yet Cashed
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Checks issued but not yet confirmed deposited. Represents cash committed from your DDA account.
              </p>
            </div>
            {checksTotal > 0 && (
              <span className="text-sm font-bold text-white ml-4 shrink-0 tabular-nums">{fmt(checksTotal)}</span>
            )}
          </div>

          {/* GAAP note */}
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-start gap-2">
            <Info size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              <strong>GAAP note:</strong> Under accrual accounting, these checks are recorded as a reduction to your cash (DDA) balance when written, per GAAP (ASC 230). Showing them here alongside real-time DDA balances gives you a true picture of uncommitted cash available. This is standard practice for contractor AP management.
            </p>
          </div>

          {outstandingChecks.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No outstanding uncleared checks. All written checks have been confirmed or no checks have been issued.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="px-5 py-2 text-left">Vendor</th>
                      <th className="px-5 py-2 text-left">Check #</th>
                      <th className="px-5 py-2 text-left">Draw</th>
                      <th className="px-5 py-2 text-left">Written Date</th>
                      <th className="px-5 py-2 text-right">Days Outstanding</th>
                      <th className="px-5 py-2 text-right">Amount</th>
                      <th className="px-5 py-2 text-left print:hidden">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingChecks.map((c, idx) => (
                      <tr key={c.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? "bg-gray-50/50" : ""} ${c.days_outstanding > 30 ? "bg-amber-50/40" : ""}`}>
                        <td className="px-5 py-2 font-medium text-gray-800">{c.vendor_name}</td>
                        <td className="px-5 py-2 text-gray-600">{c.check_number ? `#${c.check_number}` : "—"}</td>
                        <td className="px-5 py-2 text-gray-500 text-xs">
                          {c.draw_date ? fmtDate(c.draw_date) : "—"}
                        </td>
                        <td className="px-5 py-2 text-gray-500">{fmtDate(c.payment_date)}</td>
                        <td className={`px-5 py-2 text-right font-medium tabular-nums ${c.days_outstanding > 30 ? "text-amber-600" : "text-gray-600"}`}>
                          {c.days_outstanding}d
                          {c.days_outstanding > 30 && <span className="ml-1 text-xs text-amber-500">⚠</span>}
                        </td>
                        <td className="px-5 py-2 text-right font-semibold text-gray-800 tabular-nums">{fmtFull(c.amount)}</td>
                        <td className="px-5 py-2 print:hidden">
                          {c.draw_id && (
                            <Link
                              href={`/draws/${c.draw_id}`}
                              className="text-xs text-[#4272EF] hover:underline"
                            >
                              View Draw →
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                      <td colSpan={5} className="px-5 py-3 text-gray-700 text-sm">Total Uncommitted Cash Obligation</td>
                      <td className="px-5 py-3 text-right text-gray-900 tabular-nums">{fmt(checksTotal)}</td>
                      <td className="print:hidden" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="px-5 py-3 bg-slate-50 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Checks outstanding more than 30 days are flagged. Contact the vendor to confirm receipt or void and reissue if necessary.
                  Mark a check cleared by visiting the draw and marking the vendor as paid.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </ReportChrome>
  );
}
