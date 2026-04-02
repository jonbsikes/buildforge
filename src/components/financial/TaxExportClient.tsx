"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Download, FileText, CheckCircle2 } from "lucide-react";

function toCSV(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

export default function TaxExportClient() {
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function exportAll() {
    setError(null);
    setDone([]);
    const supabase = createClient();
    const fromDate = `${year}-01-01`;
    const toDate = `${year}-12-31`;

    startTransition(async () => {
      try {
        const completed: string[] = [];

        // 1. GL entries
        const { data: gl } = await supabase
          .from("gl_entries")
          .select("entry_date, description, debit_account, credit_account, amount, source_type")
          .gte("entry_date", fromDate)
          .lte("entry_date", toDate)
          .order("entry_date");

        if (gl && gl.length > 0) {
          downloadCSV(
            `gl_entries_${year}.csv`,
            toCSV(
              ["Date", "Description", "Debit Account", "Credit Account", "Amount", "Source Type"],
              gl.map((r) => [r.entry_date, r.description, r.debit_account, r.credit_account, r.amount, r.source_type])
            )
          );
          completed.push("GL Entries");
        } else {
          completed.push("GL Entries (empty)");
        }

        // 2. Paid invoices
        const { data: invoices } = await supabase
          .from("invoices")
          .select("invoice_date, invoice_number, vendor, amount, total_amount, status, payment_date, payment_method, projects(name), cost_codes(code, name)")
          .in("status", ["approved", "paid"])
          .gte("invoice_date", fromDate)
          .lte("invoice_date", toDate)
          .order("invoice_date");

        if (invoices) {
          downloadCSV(
            `invoices_${year}.csv`,
            toCSV(
              ["Invoice Date", "Invoice #", "Vendor", "Project", "Cost Code", "Amount", "Status", "Payment Date", "Payment Method"],
              invoices.map((inv) => {
                const project = inv.projects as { name: string } | null;
                const cc = inv.cost_codes as { code: string; name: string } | null;
                return [
                  inv.invoice_date,
                  inv.invoice_number,
                  inv.vendor,
                  project?.name ?? "",
                  cc ? `${cc.code} — ${cc.name}` : "",
                  inv.total_amount ?? inv.amount,
                  inv.status,
                  inv.payment_date,
                  inv.payment_method,
                ];
              })
            )
          );
          completed.push("Paid Invoices");
        }

        // 3. Vendor totals
        const vendorMap: Record<string, number> = {};
        for (const inv of invoices ?? []) {
          const v = inv.vendor ?? "Unknown";
          vendorMap[v] = (vendorMap[v] ?? 0) + (inv.total_amount ?? inv.amount ?? 0);
        }
        downloadCSV(
          `vendor_totals_${year}.csv`,
          toCSV(
            ["Vendor", "Total Paid"],
            Object.entries(vendorMap)
              .sort((a, b) => b[1] - a[1])
              .map(([v, amt]) => [v, amt])
          )
        );
        completed.push("Vendor Totals");

        // 4. P&L summary per project
        const { data: projects } = await supabase.from("projects").select("id, name, project_type").order("name");
        const { data: projectBudgets } = await supabase.from("project_cost_codes").select("project_id, budgeted_amount");
        const budgetByProject: Record<string, number> = {};
        for (const b of projectBudgets ?? []) {
          budgetByProject[b.project_id] = (budgetByProject[b.project_id] ?? 0) + (b.budgeted_amount ?? 0);
        }

        const actualByProject: Record<string, number> = {};
        for (const inv of invoices ?? []) {
          const pid = (inv as Record<string, unknown>).project_id as string | null;
          if (pid) {
            actualByProject[pid] = (actualByProject[pid] ?? 0) + (inv.total_amount ?? inv.amount ?? 0);
          }
        }

        downloadCSV(
          `pl_summary_${year}.csv`,
          toCSV(
            ["Project", "Type", "Budget", "Actual Spend", "Variance"],
            (projects ?? []).map((p) => {
              const budget = budgetByProject[p.id] ?? 0;
              const actual = actualByProject[p.id] ?? 0;
              return [p.name, p.project_type, budget, actual, budget - actual];
            })
          )
        );
        completed.push("P&L Summary");

        setDone(completed);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Export failed");
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Tax Package Export</h2>
          <p className="text-sm text-gray-500">
            Download a set of CSV files for your fiscal year — GL entries, paid invoices, vendor totals, and a P&L summary by project.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Fiscal Year</label>
          <select
            value={year}
            onChange={(e) => { setYear(e.target.value); setDone([]); }}
            className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] bg-white"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Files included */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Files Included</p>
          {[
            { name: `gl_entries_${year}.csv`, desc: "All GL journal entries for the year" },
            { name: `invoices_${year}.csv`, desc: "All approved/paid invoices with project and cost code" },
            { name: `vendor_totals_${year}.csv`, desc: "Total paid per vendor, sorted by amount" },
            { name: `pl_summary_${year}.csv`, desc: "Budget vs actual per project" },
          ].map((f) => (
            <div key={f.name} className="flex items-start gap-2.5 text-sm">
              <FileText size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-mono text-xs text-gray-700">{f.name}</span>
                <p className="text-xs text-gray-400">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {done.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
            {done.map((d) => (
              <div key={d} className="flex items-center gap-2 text-sm text-green-800">
                <CheckCircle2 size={14} />
                {d}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={exportAll}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
        >
          <Download size={15} />
          {isPending ? "Generating…" : `Download ${year} Tax Package`}
        </button>
      </div>
    </div>
  );
}
