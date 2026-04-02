"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, ChevronRight, FileDown } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

interface InvoiceRow {
  vendor: string;
  project: string;
  cost_code: string;
  amount: number;
  invoice_date: string;
  status: string;
}

interface VendorGroup {
  vendor: string;
  total: number;
  byProject: Record<string, { total: number; rows: InvoiceRow[] }>;
}

export default function VendorSpendClient() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [invoicesRes, projectsRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("vendor, project_id, cost_code_id, amount, total_amount, invoice_date, status, projects(name), cost_codes(code, name)")
          .in("status", ["approved", "paid"])
          .order("vendor"),
        supabase.from("projects").select("id, name").order("name"),
      ]);

      const rows: InvoiceRow[] = (invoicesRes.data ?? []).map((inv) => {
        const project = inv.projects as { name: string } | null;
        const costCode = inv.cost_codes as { code: string; name: string } | null;
        return {
          vendor: inv.vendor ?? "Unknown Vendor",
          project: project?.name ?? "No Project",
          cost_code: costCode ? `${costCode.code} — ${costCode.name}` : "—",
          amount: inv.total_amount ?? inv.amount ?? 0,
          invoice_date: inv.invoice_date ?? "",
          status: inv.status,
        };
      });

      setInvoices(rows);
      setProjects(projectsRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => invoices.filter((r) => {
    if (filterProject && r.project !== filterProject) return false;
    if (filterFrom && r.invoice_date < filterFrom) return false;
    if (filterTo && r.invoice_date > filterTo) return false;
    return true;
  }), [invoices, filterProject, filterFrom, filterTo]);

  const vendorGroups = useMemo(() => {
    const map: Record<string, VendorGroup> = {};
    for (const r of filtered) {
      if (!map[r.vendor]) map[r.vendor] = { vendor: r.vendor, total: 0, byProject: {} };
      map[r.vendor].total += r.amount;
      if (!map[r.vendor].byProject[r.project]) map[r.vendor].byProject[r.project] = { total: 0, rows: [] };
      map[r.vendor].byProject[r.project].total += r.amount;
      map[r.vendor].byProject[r.project].rows.push(r);
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const grandTotal = vendorGroups.reduce((s, g) => s + g.total, 0);

  function toggleVendor(vendor: string) {
    setExpandedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(vendor)) next.delete(vendor); else next.add(vendor);
      return next;
    });
  }

  const projectNames = [...new Set(invoices.map((r) => r.project))].sort();

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Vendors with Spend</p>
          <p className="text-xl font-semibold text-gray-900">{vendorGroups.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Invoices</p>
          <p className="text-xl font-semibold text-gray-900">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400 mb-1">Total Paid</p>
          <p className="text-xl font-semibold text-blue-700">{fmt(grandTotal)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">All Projects</option>
          {projectNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>From</span>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white" />
          <span>To</span>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white" />
        </div>
        <div className="ml-auto">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <FileDown size={15} /> Export PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : vendorGroups.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No approved/paid invoices found.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100" style={{ backgroundColor: "#4272EF" }}>
            <h2 className="text-sm font-semibold text-white">
              Vendor Spend — {vendorGroups.length} vendor{vendorGroups.length !== 1 ? "s" : ""} · {fmt(grandTotal)} total
            </h2>
          </div>

          {vendorGroups.map((vg) => {
            const isExpanded = expandedVendors.has(vg.vendor);
            return (
              <div key={vg.vendor} className="border-b border-gray-100 last:border-0">
                {/* Vendor header row */}
                <button
                  onClick={() => toggleVendor(vg.vendor)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                    <span className="font-semibold text-gray-900 text-sm">{vg.vendor}</span>
                    <span className="text-xs text-gray-400">{Object.keys(vg.byProject).length} project{Object.keys(vg.byProject).length !== 1 ? "s" : ""}</span>
                  </div>
                  <span className="font-semibold text-gray-900 text-sm">{fmt(vg.total)}</span>
                </button>

                {/* Expanded breakdown */}
                {isExpanded && (
                  <div className="bg-gray-50 border-t border-gray-100">
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                          <th className="text-left px-8 py-2">Project</th>
                          <th className="text-left px-5 py-2">Cost Code</th>
                          <th className="text-left px-5 py-2">Date</th>
                          <th className="text-right px-5 py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(vg.byProject).map(([proj, pd]) =>
                          pd.rows.map((row, i) => (
                            <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-white transition-colors">
                              <td className="px-8 py-2 text-gray-700">{row.project}</td>
                              <td className="px-5 py-2 text-xs text-gray-500">{row.cost_code}</td>
                              <td className="px-5 py-2 text-gray-500">{row.invoice_date || "—"}</td>
                              <td className="px-5 py-2 text-right text-gray-800 font-medium">{fmt(row.amount)}</td>
                            </tr>
                          ))
                        )}
                        <tr className="border-t border-gray-200 bg-gray-100">
                          <td colSpan={3} className="px-8 py-2 text-xs font-semibold text-gray-600">{vg.vendor} Total</td>
                          <td className="px-5 py-2 text-right font-semibold text-gray-900">{fmt(vg.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-200 font-bold">
            <span className="text-gray-800">Grand Total</span>
            <span className="text-gray-900">{fmt(grandTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
