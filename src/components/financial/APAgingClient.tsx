"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDown } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
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

const BUCKET_COLORS: Record<AgingBucket, string> = {
  "current": "bg-green-100 text-green-700", "1-30": "bg-yellow-100 text-yellow-700",
  "31-60": "bg-orange-100 text-orange-700", "61-90": "bg-red-100 text-red-700", "90+": "bg-red-200 text-red-800",
};

export default function APAgingClient() {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const today = new Date().toISOString().split("T")[0];

      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, vendor, invoice_number, invoice_date, due_date, amount, status, project_id, projects(id, name)")
        .in("status", ["pending_review", "approved", "scheduled"])
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

      const allVendors = [...new Set(agingRows.map(r => r.vendor))].sort();
      const { data: projectList } = await supabase.from("projects").select("id, name").order("name");

      setRows(agingRows);
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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
        <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">All Vendors</option>
          {vendors.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <div className="ml-auto">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <FileDown size={15} /> Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        {buckets.map(b => (
          <div key={b} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <p className="text-xs text-gray-500 mb-1">{BUCKET_LABELS[b]}</p>
            <p className={`text-sm font-semibold px-2 py-0.5 rounded-full inline-block ${BUCKET_COLORS[b]}`}>{fmt(bucketTotals[b])}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : (
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
                    <div className={`px-5 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide border-b border-gray-100 ${BUCKET_COLORS[bucket]}`}>
                      <span>{BUCKET_LABELS[bucket]}</span>
                      <span>{fmt(bucketTotal)}</span>
                    </div>
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-50 text-xs text-gray-400 uppercase tracking-wide">
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
                        {bucketRows.map(row => (
                          <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-2.5 font-medium text-gray-800">{row.vendor}</td>
                            <td className="px-5 py-2.5 text-gray-600">{row.invoice_number}</td>
                            <td className="px-5 py-2.5 text-gray-600">{row.project}</td>
                            <td className="px-5 py-2.5 text-gray-500">{row.invoice_date}</td>
                            <td className="px-5 py-2.5 text-gray-500">{row.due_date}</td>
                            <td className="px-5 py-2.5 text-right font-medium text-gray-800">{fmt(row.amount)}</td>
                            <td className="px-5 py-2.5 text-right text-gray-600">{row.days_outstanding}</td>
                            <td className="px-5 py-2.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.status === "pending_review" ? "bg-amber-100 text-amber-700" : row.status === "approved" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                                {row.status.replace(/_/g, " ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                        <tr className="border-b border-gray-100 bg-gray-50 font-semibold text-sm">
                          <td colSpan={5} className="px-5 py-2 text-gray-700">{BUCKET_LABELS[bucket]} Subtotal</td>
                          <td className="px-5 py-2 text-right text-gray-800">{fmt(bucketTotal)}</td>
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
                <span className="text-gray-900 text-base">{fmt(grandTotal)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
