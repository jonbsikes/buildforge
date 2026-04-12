// @ts-nocheck
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

        // 1. GL entries from journal_entry_lines + journal_entries + chart_of_accounts
        const { data: jelData } = await supabase
          .from("journal_entry_lines")
          .select(`
            debit, credit, description,
            account:chart_of_accounts(account_number, name, type),
            journal_entry:journal_entries(entry_date, description, reference, status, source_type),
            project:projects(name)
          `);

        const glLines = (jelData ?? []).filter((l: any) =>
          l.journal_entry?.status === "posted" &&
          l.journal_entry?.entry_date >= fromDate &&
          l.journal_entry?.entry_date <= toDate
        );

        if (glLines.length > 0) {
          downloadCSV(
            `gl_entries_${year}.csv`,
            toCSV(
              ["Date", "Reference", "Description", "Account #", "Account Name", "Account Type", "Project", "Debit", "Credit", "Source Type"],
              glLines.map((l: any) => [
                l.journal_entry?.entry_date,
                l.journal_entry?.reference ?? "",
                l.description || l.journal_entry?.description || "",
                l.account?.account_number ?? "",
                l.account?.name ?? "",
                l.account?.type ?? "",
                l.project?.name ?? "",
                Number(l.debit ?? 0) > 0 ? Number(l.debit) : "",
                Number(l.credit ?? 0) > 0 ? Number(l.credit) : "",
                l.journal_entry?.source_type ?? "",
              ])
            )
          );
          completed.push(`GL Entries (${glLines.length} lines)`);
        } else {
          completed.push("GL Entries (empty)");
        }

        // 2. Paid invoices
        const { data: invoices } = await supabase
          .from("invoices")
          .select("invoice_date, invoice_number, vendor, amount, total_amount, status, payment_date, payment_method, projects(name), cost_codes(code, name)")
          .in("status", ["approved", "scheduled", "released", "cleared", "pending_review"])
          .gte("invoice_date", fromDate)
          .lte("invoice_date", toDate)
          .order("invoice_date");

        if (invoices && invoices.length > 0) {
          downloadCSV(
            `invoices_${year}.csv`,
            toCSV(
              ["Invoice Date", "Invoice #", "Vendor", "Project", "Cost Code", "Amount", "Status", "Payment Date", "Payment Method"],
              invoices.map((inv: any) => {
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
          completed.push(`Invoices (${invoices.length})`);
        } else {
          completed.push("Invoices (empty)");
        }

        // 3. Vendor totals
        const vendorMap: Record<string, number> = {};
        for (const inv of invoices ?? []) {
          const v = (inv as any).vendor ?? "Unknown";
          vendorMap[v] = (vendorMap[v] ?? 0) + ((inv as any).total_amount ?? (inv as any).amount ?? 0);
        }
        downloadCSV(
          `vendor_totals_${year}.csv`,
          toCSV(
            ["Vendor", "Total Amount"],
            Object.entries(vendorMap)
              .sort((a, b) => b[1] - a[1])
              .map(([v, amt]) => [v, amt])
          )
        );
        completed.push("Vendor Totals");

        // 4. Account balances summary (from GL)
        const acctMap: Record<string, { number: string; name: string; type: string; debit: number; credit: number }> = {};
        for (const l of glLines) {
          const acc = (l as any).account;
          if (!acc) continue;
          const key = acc.account_number;
          if (!acctMap[key]) acctMap[key] = { number: acc.account_number, name: acc.name, type: acc.type, debit: 0, credit: 0 };
          acctMap[key].debit += Number((l as any).debit ?? 0);
          acctMap[key].credit += Number((l as any).credit ?? 0);
        }

        downloadCSV(
          `account_balances_${year}.csv`,
          toCSV(
            ["Account #", "Account Name", "Type", "Total Debits", "Total Credits", "Balance"],
            Object.values(acctMap)
              .sort((a, b) => a.number.localeCompare(b.number))
              .map(a => {
                const balance = (a.type === "asset" || a.type === "expense" || a.type === "cogs")
                  ? a.debit - a.credit
                  : a.credit - a.debit;
                return [a.number, a.name, a.type, a.debit, a.credit, balance];
              })
          )
        );
        completed.push("Account Balances");

        // 5. Project WIP summary
        const projectWIP: Record<string, { name: string; wip: number; loans: number }> = {};
        for (const l of glLines) {
          const acc = (l as any).account;
          const proj = (l as any).project;
          if (!acc || !proj) continue;
          const pname = proj.name;
          if (!projectWIP[pname]) projectWIP[pname] = { name: pname, wip: 0, loans: 0 };
          if (acc.account_number === "1210" || acc.account_number === "1220") {
            projectWIP[pname].wip += Number((l as any).debit ?? 0) - Number((l as any).credit ?? 0);
          }
          if (acc.account_number === "2100") {
            projectWIP[pname].loans += Number((l as any).credit ?? 0) - Number((l as any).debit ?? 0);
          }
        }

        downloadCSV(
          `project_wip_${year}.csv`,
          toCSV(
            ["Project", "WIP Balance", "Loan Balance", "Net Equity"],
            Object.values(projectWIP)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(p => [p.name, p.wip, p.loans, p.wip - p.loans])
          )
        );
        completed.push("Project WIP Summary");

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
            Download a set of CSV files for your fiscal year — GL journal entries, invoices, vendor totals, account balances, and project WIP summary.
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
            { name: `gl_entries_${year}.csv`, desc: "All posted GL journal entry lines with account details" },
            { name: `invoices_${year}.csv`, desc: "All invoices with project and cost code" },
            { name: `vendor_totals_${year}.csv`, desc: "Total per vendor, sorted by amount" },
            { name: `account_balances_${year}.csv`, desc: "Account-level debit/credit/balance summary" },
            { name: `project_wip_${year}.csv`, desc: "WIP and loan balance per project" },
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
