"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, AlertCircle, ChevronDown, X, Search } from "lucide-react";
import { createVendor, updateVendor, type VendorFormData } from "@/app/actions/vendors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostCodeOption {
  id: string;
  code: string;
  name: string;
  category: string;
}

interface Props {
  costCodes: CostCodeOption[];
  initialData?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    trade: string | null;
    coi_expiry_date: string | null;
    license_expiry_date: string | null;
    notes: string | null;
  };
}

// ---------------------------------------------------------------------------
// Category grouping
// ---------------------------------------------------------------------------

const CONSTRUCTION_CATS = new Set([
  "siteworks", "foundation", "framing", "roofing", "electrical",
  "plumbing", "hvac", "insulation", "drywall", "flooring",
  "cabinetry", "painting", "landscaping",
]);
const GA_CATS = new Set(["permits", "professional_fees", "contingency", "other"]);

function getGroup(category: string): "Land Development" | "Home Construction" | "General & Admin" {
  if (category === "land") return "Land Development";
  if (CONSTRUCTION_CATS.has(category)) return "Home Construction";
  if (GA_CATS.has(category)) return "General & Admin";
  return "Home Construction"; // fallback
}

const GROUP_ORDER = ["Land Development", "Home Construction", "General & Admin"] as const;

// ---------------------------------------------------------------------------
// Expiry helpers
// ---------------------------------------------------------------------------

function expiryStatus(date: string | null): "expired" | "expiring" | "ok" {
  if (!date) return "ok";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "expired";
  if (diff <= 30) return "expiring";
  return "ok";
}

function ExpiryIndicator({ label, date }: { label: string; date: string | null }) {
  const status = expiryStatus(date);
  if (status === "ok") return null;
  if (status === "expired") {
    return (
      <div className="flex items-center gap-1.5 mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1">
        <AlertCircle size={12} />
        {label} expired on {date}. Vendor is blocked.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
      <AlertTriangle size={12} />
      {label} expires on {date} (within 30 days). Collect renewal.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade multi-select
// ---------------------------------------------------------------------------

function TradeSelect({
  costCodes,
  selected,
  onChange,
}: {
  costCodes: CostCodeOption[];
  selected: string[];
  onChange: (trades: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Group and filter codes
  const filtered = search
    ? costCodes.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.toLowerCase().includes(search.toLowerCase())
      )
    : costCodes;

  const grouped = GROUP_ORDER.reduce(
    (acc, grp) => {
      acc[grp] = filtered.filter((c) => getGroup(c.category) === grp);
      return acc;
    },
    {} as Record<string, CostCodeOption[]>
  );

  function toggle(name: string) {
    if (selected.includes(name)) {
      onChange(selected.filter((t) => t !== name));
    } else {
      onChange([...selected, name]);
    }
  }

  function remove(name: string) {
    onChange(selected.filter((t) => t !== name));
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] bg-white text-left"
      >
        <span className="text-gray-500">
          {selected.length === 0
            ? "Select trades…"
            : `${selected.length} trade${selected.length !== 1 ? "s" : ""} selected`}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 bg-[#4272EF]/10 text-[#4272EF] text-xs font-medium px-2 py-0.5 rounded-full"
            >
              {t}
              <button
                type="button"
                onClick={() => remove(t)}
                className="hover:text-red-500 transition-colors"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search trades…"
                className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
                autoFocus
              />
            </div>
          </div>

          {/* Groups */}
          <div className="max-h-72 overflow-y-auto">
            {GROUP_ORDER.map((grp) => {
              const codes = grouped[grp];
              if (codes.length === 0) return null;
              return (
                <div key={grp}>
                  <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 sticky top-0">
                    {grp}
                  </p>
                  {codes.map((c) => {
                    const isChecked = selected.includes(c.name);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                          isChecked ? "bg-[#4272EF]/5" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(c.name)}
                          className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]"
                        />
                        <span className="text-xs text-gray-500 w-8 flex-shrink-0">{c.code}</span>
                        <span className="text-sm text-gray-800">{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No trades match "{search}"</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export default function VendorForm({ costCodes, initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initialData;

  // Parse stored trades (JSON array or plain string fallback)
  function parseTrades(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {}
    return [raw]; // legacy plain string
  }

  const [form, setForm] = useState({
    name: initialData?.name ?? "",
    email: initialData?.email ?? "",
    phone: initialData?.phone ?? "",
    address: initialData?.address ?? "",
    trades: parseTrades(initialData?.trade ?? null),
    coi_expiry_date: initialData?.coi_expiry_date ?? "",
    license_expiry_date: initialData?.license_expiry_date ?? "",
    notes: initialData?.notes ?? "",
  });

  function set(field: string, value: string | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Vendor name is required");
      return;
    }
    setError(null);

    const data: VendorFormData = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      trades: form.trades,
      coi_expiry_date: form.coi_expiry_date || null,
      license_expiry_date: form.license_expiry_date || null,
      notes: form.notes.trim() || null,
    };

    startTransition(async () => {
      if (isEdit && initialData) {
        const result = await updateVendor(initialData.id, data);
        if (result.error) {
          setError(result.error);
        } else {
          router.push("/vendors");
        }
      } else {
        const result = await createVendor(data);
        if (result.error) {
          setError(result.error);
        } else {
          router.push("/vendors");
        }
      }
    });
  }

  const coiStatus = expiryStatus(form.coi_expiry_date || null);
  const licenseStatus = expiryStatus(form.license_expiry_date || null);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Vendor Information</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Vendor Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="ABC Framing LLC"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="contact@vendor.com"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="123 Main St, City, State"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Trade(s)</label>
            <TradeSelect
              costCodes={costCodes}
              selected={form.trades}
              onChange={(t) => set("trades", t)}
            />
            <p className="text-xs text-gray-400 mt-1">
              Select all trades that apply. Source: cost code master list.
            </p>
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Any relevant notes about this vendor…"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none"
            />
          </div>
        </div>
      </div>

      {/* Compliance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Compliance</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              COI Expiry Date
            </label>
            <input
              type="date"
              value={form.coi_expiry_date}
              onChange={(e) => set("coi_expiry_date", e.target.value)}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] ${
                coiStatus === "expired"
                  ? "border-red-300 bg-red-50"
                  : coiStatus === "expiring"
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-300"
              }`}
            />
            <ExpiryIndicator label="COI" date={form.coi_expiry_date || null} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              License Expiry Date
            </label>
            <input
              type="date"
              value={form.license_expiry_date}
              onChange={(e) => set("license_expiry_date", e.target.value)}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] ${
                licenseStatus === "expired"
                  ? "border-red-300 bg-red-50"
                  : licenseStatus === "expiring"
                  ? "border-amber-300 bg-amber-50"
                  : "border-gray-300"
              }`}
            />
            <ExpiryIndicator label="License" date={form.license_expiry_date || null} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/vendors")}
          className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>

        <div className="flex items-center gap-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
          >
            {isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Vendor"}
          </button>
        </div>
      </div>
    </form>
  );
}
