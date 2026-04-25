"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2, Truck } from "lucide-react";
import { createVendor, updateVendor, deleteVendor } from "@/app/actions/vendors";
import ConfirmButton from "@/components/ui/ConfirmButton";
import StatusBadge from "@/components/ui/StatusBadge";
import Money from "@/components/ui/Money";
import DateValue from "@/components/ui/DateValue";
import EmptyState from "@/components/ui/EmptyState";
import FilterChipRail, { type FilterChip } from "@/components/ui/FilterChipRail";
import type { Database } from "@/types/database";

function vendorInputFromForm(fd: FormData, existing?: Vendor) {
  const trade = (fd.get("trade") as string) || null;
  return {
    name: (fd.get("name") as string) || "",
    email: (fd.get("email") as string) || null,
    phone: (fd.get("phone") as string) || null,
    address: existing?.address ?? null,
    trades: trade ? [trade] : [],
    coi_expiry_date: (fd.get("coi_expiry_date") as string) || null,
    license_expiry_date: (fd.get("license_expiry_date") as string) || null,
    notes: existing?.notes ?? null,
    primary_contact_name: existing?.primary_contact_name ?? null,
    primary_contact_email: existing?.primary_contact_email ?? null,
    primary_contact_phone: existing?.primary_contact_phone ?? null,
    accounting_contact_name: existing?.accounting_contact_name ?? null,
    accounting_contact_email: existing?.accounting_contact_email ?? null,
    accounting_contact_phone: existing?.accounting_contact_phone ?? null,
    ach_bank_name: existing?.ach_bank_name ?? null,
    ach_routing_number: existing?.ach_routing_number ?? null,
    ach_account_number: existing?.ach_account_number ?? null,
    ach_account_type: existing?.ach_account_type ?? null,
  };
}

type Vendor = Database["public"]["Tables"]["vendors"]["Row"] & {
  ytd_spend?: number;
  open_invoices?: number;
  open_amount?: number;
  last_invoice_date?: string | null;
  active_contracts?: number;
};

const TRADES = [
  "General", "Framing", "Concrete", "Electrical", "Plumbing", "HVAC",
  "Roofing", "Insulation", "Drywall", "Painting", "Flooring", "Tile",
  "Cabinets", "Countertops", "Landscaping", "Excavation", "Masonry",
  "Glass", "Gutters", "Garage Door", "Other",
];

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

type ComplianceStatus = "ok" | "expiring" | "expired" | "missing";

function complianceFor(v: Vendor): ComplianceStatus {
  const coi = daysUntil(v.coi_expiry_date);
  const lic = daysUntil(v.license_expiry_date);
  if ((coi !== null && coi < 0) || (lic !== null && lic < 0)) return "expired";
  if ((coi !== null && coi <= 30) || (lic !== null && lic <= 30)) return "expiring";
  if (v.coi_expiry_date && v.license_expiry_date) return "ok";
  return "missing";
}

function ComplianceDot({ status }: { status: ComplianceStatus }) {
  const map: Record<ComplianceStatus, { color: string; label: string }> = {
    ok: { color: "var(--status-complete)", label: "Compliance current" },
    expiring: { color: "var(--status-warning)", label: "Compliance expiring soon" },
    expired: { color: "var(--status-over)", label: "Compliance expired" },
    missing: { color: "var(--status-planned)", label: "Compliance not on file" },
  };
  const { color, label } = map[status];
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
      title={label}
      aria-label={label}
    />
  );
}

function VendorForm({
  vendor,
  onDone,
}: {
  vendor?: Vendor;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const isEdit = !!vendor;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const input = vendorInputFromForm(fd, vendor);
        startTransition(async () => {
          if (isEdit) await updateVendor(vendor.id, input);
          else await createVendor(input);
          onDone();
        });
      }}
      className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4"
    >
      <h3 className="font-semibold text-gray-900">{isEdit ? "Edit Vendor" : "New Vendor"}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          name="name"
          required
          defaultValue={vendor?.name ?? ""}
          placeholder="Company name *"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <select
          name="trade"
          defaultValue={vendor?.trade ?? ""}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">Select trade</option>
          {TRADES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          name="email"
          type="email"
          defaultValue={vendor?.email ?? ""}
          placeholder="Email"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <input
          name="phone"
          defaultValue={vendor?.phone ?? ""}
          placeholder="Phone"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <div>
          <label className="block text-xs text-gray-500 mb-1">COI Expiry Date</label>
          <input
            name="coi_expiry_date"
            type="date"
            defaultValue={vendor?.coi_expiry_date ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">License Expiry Date</label>
          <input
            name="license_expiry_date"
            type="date"
            defaultValue={vendor?.license_expiry_date ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "#4272EF" }}
        >
          {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Vendor"}
        </button>
      </div>
    </form>
  );
}

type FilterId = "all" | "active" | "expired" | "expiring";

export default function VendorsClient({ vendors }: { vendors: Vendor[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");

  const counts = useMemo(() => {
    let active = 0;
    let expired = 0;
    let expiring = 0;
    for (const v of vendors) {
      const c = complianceFor(v);
      if (c === "ok" || c === "missing") active += 1;
      if (c === "expired") {
        expired += 1;
        active += 1;
      }
      if (c === "expiring") {
        expiring += 1;
        active += 1;
      }
    }
    return { all: vendors.length, active, expired, expiring };
  }, [vendors]);

  const filtered = vendors.filter((v) => {
    const matchSearch =
      !search ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (v.trade ?? "").toLowerCase().includes(search.toLowerCase());
    const c = complianceFor(v);
    const matchFilter =
      filter === "all" ||
      (filter === "active" && (c === "ok" || c === "missing")) ||
      (filter === "expired" && c === "expired") ||
      (filter === "expiring" && c === "expiring");
    return matchSearch && matchFilter;
  });

  const chips: FilterChip<FilterId>[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "active", label: "Active", count: counts.active, tone: "complete" },
    { id: "expired", label: "Expired", count: counts.expired, tone: counts.expired > 0 ? "over" : "neutral" },
    { id: "expiring", label: "Expiring <30d", count: counts.expiring, tone: counts.expiring > 0 ? "warning" : "neutral" },
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Filter chip rail (was: red/amber compliance banners) */}
      <FilterChipRail<FilterId> chips={chips} active={filter} onChange={setFilter} />

      {/* Search row */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, trade, or email…"
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
          style={{ backgroundColor: "#4272EF" }}
        >
          <Plus size={15} /> Add Vendor
        </button>
      </div>

      {showAdd && <VendorForm onDone={() => setShowAdd(false)} />}

      {/* Vendor list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200">
            <EmptyState
              icon={<Truck size={20} />}
              title={search ? "No vendors match your search" : "No vendors yet"}
              description={
                search
                  ? "Try a different name, trade, or email."
                  : "Vendors are subcontractors and suppliers you pay. They're linked to invoices and contracts, with COI/license expiry tracked."
              }
              primary={search ? undefined : { label: "+ Add your first vendor", onClick: () => setShowAdd(true) }}
            />
          </div>
        ) : (
          filtered.map((vendor) =>
            editingId === vendor.id ? (
              <VendorForm key={vendor.id} vendor={vendor} onDone={() => setEditingId(null)} />
            ) : (
              <div key={vendor.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <ComplianceDot status={complianceFor(vendor)} />
                      <Link
                        href={`/vendors/${vendor.id}`}
                        className="font-semibold text-gray-900 hover:text-[#4272EF] transition-colors"
                      >
                        {vendor.name}
                      </Link>
                      {vendor.trade && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {vendor.trade}
                        </span>
                      )}
                      {complianceFor(vendor) === "expired" && (
                        <StatusBadge status="over" size="sm">COI/license expired</StatusBadge>
                      )}
                      {complianceFor(vendor) === "expiring" && (
                        <StatusBadge status="warning" size="sm">Expiring &lt;30d</StatusBadge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 mt-2">
                      {vendor.email && <span>{vendor.email}</span>}
                      {vendor.phone && <span>{vendor.phone}</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs">
                      <div>
                        <span className="text-gray-400 mr-1.5">YTD spend</span>
                        <Money value={vendor.ytd_spend ?? 0} className="font-semibold text-gray-700" />
                      </div>
                      {(vendor.open_invoices ?? 0) > 0 && (
                        <div>
                          <span className="text-gray-400 mr-1.5">Open</span>
                          <span className="font-semibold text-gray-700 tabular-nums">
                            {vendor.open_invoices}
                          </span>
                          <span className="text-gray-400 mx-1">·</span>
                          <Money value={vendor.open_amount ?? 0} className="font-semibold text-gray-700" />
                        </div>
                      )}
                      {(vendor.active_contracts ?? 0) > 0 && (
                        <div>
                          <span className="text-gray-400 mr-1.5">Contracts</span>
                          <span className="font-semibold text-gray-700 tabular-nums">{vendor.active_contracts}</span>
                        </div>
                      )}
                      {vendor.last_invoice_date && (
                        <div>
                          <span className="text-gray-400 mr-1.5">Last invoice</span>
                          <DateValue value={vendor.last_invoice_date} kind="smart" className="font-semibold text-gray-700" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setEditingId(vendor.id)}
                      className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <ConfirmButton
                      trigger={<Trash2 size={15} />}
                      title={`Delete ${vendor.name}?`}
                      body="This permanently removes the vendor."
                      confirmLabel="Delete"
                      tone="danger"
                      onConfirm={async () => {
                        await deleteVendor(vendor.id);
                      }}
                      triggerClassName="text-gray-300 hover:text-red-500 transition-colors"
                      ariaLabel={`Delete ${vendor.name}`}
                    />
                  </div>
                </div>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}
