import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import VendorForm, { type CostCodeOption } from "@/components/vendors/VendorForm";
import VendorDocuments, { type VendorDocument } from "@/components/vendors/VendorDocuments";
import Money from "@/components/ui/Money";
import DateValue from "@/components/ui/DateValue";
import StatusBadge from "@/components/ui/StatusBadge";


interface Props {
  params: Promise<{ id: string }>;
}

export default async function VendorDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [vendorResult, codesResult, docsResult, invoicesResult, contractsResult] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, email, phone, address, trade, coi_expiry_date, license_expiry_date, notes, primary_contact_name, primary_contact_email, primary_contact_phone, accounting_contact_name, accounting_contact_email, accounting_contact_phone, ach_bank_name, ach_routing_number, ach_account_number, ach_account_type")
      .eq("id", id)
      .single(),
    supabase
      .from("cost_codes")
      .select("id, code, name, category")
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("documents")
      .select("id, folder, file_name, storage_path, file_size_kb, mime_type, notes, created_at")
      .eq("vendor_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, due_date, amount, total_amount, status, project_id, projects ( name )")
      .eq("vendor_id", id)
      .order("invoice_date", { ascending: false }),
    supabase
      .from("contracts")
      .select("id, amount, status, cost_code_id, project_id, projects ( name ), cost_codes ( code, name )")
      .eq("vendor_id", id)
      .eq("status", "active"),
  ]);

  if (!vendorResult.data) notFound();

  const vendor = vendorResult.data;
  const costCodes: CostCodeOption[] = (codesResult.data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    category: c.category,
  }));

  const invoices = invoicesResult.data ?? [];
  const contracts = contractsResult.data ?? [];

  // Per UI Review § 10 #63: spend summary, open invoices, active contracts.
  let ytdSpend = 0;
  let lifetimeSpend = 0;
  const openInvoices = invoices.filter(
    (i) => i.status === "approved" || i.status === "pending_review" || i.status === "released"
  );
  const openAmount = openInvoices.reduce((s, i) => s + (i.total_amount ?? i.amount ?? 0), 0);
  const spendByProject = new Map<string, { name: string; amount: number }>();

  for (const inv of invoices) {
    if (inv.status !== "approved" && inv.status !== "released" && inv.status !== "cleared") continue;
    const amt = inv.total_amount ?? inv.amount ?? 0;
    lifetimeSpend += amt;
    if ((inv.invoice_date ?? "") >= yearStart) ytdSpend += amt;
    const projName = (inv.projects as { name: string } | null)?.name ?? "G&A";
    const key = inv.project_id ?? "ga";
    const cur = spendByProject.get(key) ?? { name: projName, amount: 0 };
    cur.amount += amt;
    spendByProject.set(key, cur);
  }

  const projectSpend = [...spendByProject.values()].sort((a, b) => b.amount - a.amount);
  const lastInvoiceDate = invoices[0]?.invoice_date ?? null;

  return (
    <>
      <Header
        title={vendor.name}
        breadcrumbs={[
          { label: "Vendors", href: "/vendors" },
          { label: vendor.name },
        ]}
      />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Spend summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">YTD spend</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">
                <Money value={ytdSpend} />
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Lifetime</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">
                <Money value={lifetimeSpend} />
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Open invoices</p>
              <p className="text-xl font-semibold text-gray-900 mt-1 tabular-nums">{openInvoices.length}</p>
              {openAmount > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  <Money value={openAmount} className="text-gray-500" />
                </p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Last invoice</p>
              <p className="text-base font-semibold text-gray-900 mt-1">
                <DateValue value={lastInvoiceDate} kind="smart" />
              </p>
            </div>
          </div>

          {/* By-project breakdown */}
          {projectSpend.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Spend by Project</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {projectSpend.map((row) => {
                  const pct = lifetimeSpend > 0 ? (row.amount / lifetimeSpend) * 100 : 0;
                  return (
                    <div key={row.name} className="px-5 py-3 flex items-center gap-3">
                      <span className="text-sm text-gray-700 flex-1 truncate">{row.name}</span>
                      <div className="w-32 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: "var(--brand-blue)" }}
                        />
                      </div>
                      <Money value={row.amount} className="text-sm font-medium w-24 text-right" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Open invoices */}
          {openInvoices.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Open Invoices</h2>
                <span className="text-xs text-gray-400 tabular-nums">{openInvoices.length}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {openInvoices.slice(0, 8).map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900 truncate flex-1">
                      {inv.invoice_number ?? "—"}
                    </span>
                    <span className="text-xs text-gray-500 truncate">
                      {(inv.projects as { name: string } | null)?.name ?? "G&A"}
                    </span>
                    <DateValue value={inv.due_date} kind="smart" className="text-xs text-gray-400" />
                    <StatusBadge status={inv.status} size="sm" />
                    <Money value={inv.total_amount ?? inv.amount ?? 0} className="text-sm font-semibold w-24 text-right" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Active contracts */}
          {contracts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Active Contracts</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {contracts.map((c) => {
                  const cc = c.cost_codes as { code: string; name: string } | null;
                  const proj = c.projects as { name: string } | null;
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-sm font-medium text-gray-900 truncate flex-1">
                        {cc ? `${cc.code} – ${cc.name}` : "Contract"}
                      </span>
                      <span className="text-xs text-gray-500 truncate">{proj?.name ?? "G&A"}</span>
                      <Money value={c.amount} className="text-sm font-semibold w-24 text-right" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edit form */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Profile</h2>
            <VendorForm costCodes={costCodes} initialData={vendor} />
          </div>

          {/* Documents */}
          <VendorDocuments
            vendorId={id}
            initialDocs={(docsResult.data ?? []) as VendorDocument[]}
          />
        </div>
      </main>
    </>
  );
}
