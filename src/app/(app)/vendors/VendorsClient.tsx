"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, AlertTriangle, AlertCircle, Truck } from "lucide-react";
import { createVendor, updateVendor, deleteVendor } from "./actions";
import type { Database } from "@/types/database";

type Vendor = Database["public"]["Tables"]["vendors"]["Row"];

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

function ExpiryBadge({ label, dateStr }: { label: string; dateStr: string | null }) {
  if (!dateStr) return null;
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full">
        <AlertCircle size={11} /> {label} EXPIRED
      </span>
    );
  if (days <= 30)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
        <AlertTriangle size={11} /> {label} expires in {days}d
      </span>
    );
  return (
    <span className="text-xs text-gray-400">
      {label}: {dateStr}
    </span>
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
        startTransition(async () => {
          if (isEdit) await updateVendor(vendor.id, fd);
          else await createVendor(fd);
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

export default function VendorsClient({ vendors }: { vendors: Vendor[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState("");
  const [, startTransition] = useTransition();

  const filtered = vendors.filter((v) => {
    const matchSearch =
      !search ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTrade = !filterTrade || v.trade === filterTrade;
    return matchSearch && matchTrade;
  });

  const expiredCount = vendors.filter((v) => {
    const coiDays = daysUntil(v.coi_expiry_date);
    const licDays = daysUntil(v.license_expiry_date);
    return (coiDays !== null && coiDays < 0) || (licDays !== null && licDays < 0);
  }).length;

  const expiringCount = vendors.filter((v) => {
    const coiDays = daysUntil(v.coi_expiry_date);
    const licDays = daysUntil(v.license_expiry_date);
    return (
      ((coiDays !== null && coiDays >= 0 && coiDays <= 30) ||
        (licDays !== null && licDays >= 0 && licDays <= 30)) &&
      !((coiDays !== null && coiDays < 0) || (licDays !== null && licDays < 0))
    );
  }).length;

  const allTrades = Array.from(new Set(vendors.map((v) => v.trade).filter(Boolean)));

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Vendors</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{vendors.length}</p>
        </div>
        <div className={`rounded-xl border p-4 ${expiredCount > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
          <p className={`text-xs ${expiredCount > 0 ? "text-red-600" : "text-gray-500"}`}>Expired COI/License</p>
          <p className={`text-2xl font-bold mt-1 ${expiredCount > 0 ? "text-red-700" : "text-gray-900"}`}>{expiredCount}</p>
        </div>
        <div className={`rounded-xl border p-4 ${expiringCount > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
          <p className={`text-xs ${expiringCount > 0 ? "text-amber-700" : "text-gray-500"}`}>Expiring Soon (&le;30d)</p>
          <p className={`text-2xl font-bold mt-1 ${expiringCount > 0 ? "text-amber-700" : "text-gray-900"}`}>{expiringCount}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors..."
          className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <select
          value={filterTrade}
          onChange={(e) => setFilterTrade(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">All trades</option>
          {allTrades.map((t) => (
            <option key={t} value={t!}>{t}</option>
          ))}
        </select>
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
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center">
            <Truck size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No vendors found.</p>
          </div>
        ) : (
          filtered.map((vendor) =>
            editingId === vendor.id ? (
              <VendorForm key={vendor.id} vendor={vendor} onDone={() => setEditingId(null)} />
            ) : (
              <div key={vendor.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{vendor.name}</span>
                      {vendor.trade && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {vendor.trade}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                      {vendor.email && <span>{vendor.email}</span>}
                      {vendor.phone && <span>{vendor.phone}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <ExpiryBadge label="COI" dateStr={vendor.coi_expiry_date} />
                      <ExpiryBadge label="License" dateStr={vendor.license_expiry_date} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setEditingId(vendor.id)}
                      className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          if (confirm(`Delete ${vendor.name}?`)) await deleteVendor(vendor.id);
                        })
                      }
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
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
