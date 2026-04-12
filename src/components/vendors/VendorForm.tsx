"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, AlertCircle, ChevronDown, X, Search,
  Upload, FileText, Loader2, Sparkles,
} from "lucide-react";
import { createVendor, updateVendor, type VendorFormData } from "@/app/actions/vendors";
import type { ExtractedVendorData } from "@/app/api/vendors/extract/route";

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
    primary_contact_name: string | null;
    primary_contact_email: string | null;
    primary_contact_phone: string | null;
    accounting_contact_name: string | null;
    accounting_contact_email: string | null;
    accounting_contact_phone: string | null;
    ach_bank_name: string | null;
    ach_routing_number: string | null;
    ach_account_number: string | null;
    ach_account_type: string | null;
  };
  prefillName?: string; // pre-populated from invoice "Create new vendor"
  returnTo?: string; // "invoice" → redirect back to new invoice with vendor pre-selected; "invoice-upload" → redirect back to upload flow
  vendorCardIdx?: string; // which invoice card to assign the new vendor to (used with returnTo=invoice-upload)
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
  return "Home Construction";
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
  costCodes, selected, onChange,
}: {
  costCodes: CostCodeOption[];
  selected: string[];
  onChange: (trades: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = search
    ? costCodes.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.toLowerCase().includes(search.toLowerCase())
      )
    : costCodes;

  const grouped = GROUP_ORDER.reduce(
    (acc, grp) => { acc[grp] = filtered.filter((c) => getGroup(c.category) === grp); return acc; },
    {} as Record<string, CostCodeOption[]>
  );

  function toggle(name: string) {
    if (selected.includes(name)) onChange(selected.filter((t) => t !== name));
    else onChange([...selected, name]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] bg-white text-left"
      >
        <span className="text-gray-500">
          {selected.length === 0 ? "Select trades…" : `${selected.length} trade${selected.length !== 1 ? "s" : ""} selected`}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map((t) => (
            <span key={t} className="flex items-center gap-1 bg-[#4272EF]/10 text-[#4272EF] text-xs font-medium px-2 py-0.5 rounded-full">
              {t}
              <button type="button" onClick={() => toggle(t)} className="hover:text-red-500 transition-colors">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
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
          <div className="max-h-72 overflow-y-auto">
            {GROUP_ORDER.map((grp) => {
              const codes = grouped[grp];
              if (codes.length === 0) return null;
              return (
                <div key={grp}>
                  <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 sticky top-0">{grp}</p>
                  {codes.map((c) => {
                    const isChecked = selected.includes(c.name);
                    return (
                      <label key={c.id} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${isChecked ? "bg-[#4272EF]/5" : ""}`}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggle(c.name)} className="rounded border-gray-300 text-[#4272EF] focus:ring-[#4272EF]" />
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
// Field helper
// ---------------------------------------------------------------------------

function ic() {
  return "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]";
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export default function VendorForm({ costCodes, initialData, prefillName, returnTo, vendorCardIdx }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEdit = !!initialData;

  function parseTrades(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {}
    return [raw];
  }

  // AI extraction state
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionFile, setExtractionFile] = useState<File | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: prefillName ?? initialData?.name ?? "",
    email: initialData?.email ?? "",
    phone: initialData?.phone ?? "",
    address: initialData?.address ?? "",
    trades: parseTrades(initialData?.trade ?? null),
    coi_expiry_date: initialData?.coi_expiry_date ?? "",
    license_expiry_date: initialData?.license_expiry_date ?? "",
    notes: initialData?.notes ?? "",
    primary_contact_name: initialData?.primary_contact_name ?? "",
    primary_contact_email: initialData?.primary_contact_email ?? "",
    primary_contact_phone: initialData?.primary_contact_phone ?? "",
    accounting_contact_name: initialData?.accounting_contact_name ?? "",
    accounting_contact_email: initialData?.accounting_contact_email ?? "",
    accounting_contact_phone: initialData?.accounting_contact_phone ?? "",
    ach_bank_name: initialData?.ach_bank_name ?? "",
    ach_routing_number: initialData?.ach_routing_number ?? "",
    ach_account_number: initialData?.ach_account_number ?? "",
    ach_account_type: initialData?.ach_account_type ?? "",
  });

  function set(field: string, value: string | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleDocumentUpload(file: File) {
    setExtractionFile(file);
    setExtractionError(null);
    setIsExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/vendors/extract", { method: "POST", body: fd });
      const data: ExtractedVendorData & { error?: string } = await res.json();
      if (data.error) { setExtractionError(data.error); return; }

      // Apply extracted fields — only overwrite blank fields (don't clobber existing data on edit)
      // Spread prev to preserve ACH fields (manually entered, never AI-extracted)
      setForm((prev) => ({
        ...prev,
        name: prev.name || data.name || "",
        email: prev.email || data.email || "",
        phone: prev.phone || data.phone || "",
        address: prev.address || data.address || "",
        trades: prev.trades.length > 0 ? prev.trades : (data.trades ?? prev.trades),
        coi_expiry_date: prev.coi_expiry_date || data.coi_expiry_date || "",
        license_expiry_date: prev.license_expiry_date || data.license_expiry_date || "",
        notes: prev.notes || data.notes || "",
        primary_contact_name: prev.primary_contact_name || data.primary_contact_name || "",
        primary_contact_email: prev.primary_contact_email || data.primary_contact_email || "",
        primary_contact_phone: prev.primary_contact_phone || data.primary_contact_phone || "",
        accounting_contact_name: prev.accounting_contact_name || data.accounting_contact_name || "",
        accounting_contact_email: prev.accounting_contact_email || data.accounting_contact_email || "",
        accounting_contact_phone: prev.accounting_contact_phone || data.accounting_contact_phone || "",
      }));
    } catch {
      setExtractionError("Could not reach extraction service");
    } finally {
      setIsExtracting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Vendor name is required"); return; }
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
      primary_contact_name: form.primary_contact_name.trim() || null,
      primary_contact_email: form.primary_contact_email.trim() || null,
      primary_contact_phone: form.primary_contact_phone.trim() || null,
      accounting_contact_name: form.accounting_contact_name.trim() || null,
      accounting_contact_email: form.accounting_contact_email.trim() || null,
      accounting_contact_phone: form.accounting_contact_phone.trim() || null,
      ach_bank_name: form.ach_bank_name.trim() || null,
      ach_routing_number: form.ach_routing_number.trim() || null,
      ach_account_number: form.ach_account_number.trim() || null,
      ach_account_type: form.ach_account_type || null,
    };

    startTransition(async () => {
      if (isEdit && initialData) {
        const result = await updateVendor(initialData.id, data);
        if (result.error) setError(result.error);
        else router.push("/vendors");
      } else {
        const result = await createVendor(data);
        if (result.error) setError(result.error);
        else if (returnTo === "invoice" && result.vendorId) {
          router.push(`/invoices/new?vendorId=${result.vendorId}`);
        } else if (returnTo === "invoice-upload" && result.vendorId) {
          const params = new URLSearchParams();
          params.set("vendorId", result.vendorId);
          params.set("vendorName", data.name || "");
          if (vendorCardIdx != null) params.set("vendorCardIdx", vendorCardIdx);
          router.push(`/invoices/upload?${params.toString()}`);
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

      {/* AI Document Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-[#4272EF]" />
          <h3 className="text-sm font-semibold text-gray-700">AI Auto-Fill (optional)</h3>
        </div>
        <p className="text-xs text-gray-400">Upload a W9, COI, invoice, or any vendor document — AI will extract and fill in the fields below.</p>

        {!extractionFile ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-[#4272EF] hover:bg-blue-50/30 transition-colors"
          >
            <Upload size={22} className="text-gray-400 mx-auto mb-1.5" />
            <p className="text-sm text-gray-500">Drop a PDF or image here, or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf,image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocumentUpload(f); }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2.5">
            {isExtracting
              ? <Loader2 size={15} className="text-[#4272EF] animate-spin flex-shrink-0" />
              : <FileText size={15} className="text-gray-400 flex-shrink-0" />}
            <span className="text-sm text-gray-700 flex-1 truncate">{extractionFile.name}</span>
            {isExtracting
              ? <span className="text-xs text-gray-400">Extracting…</span>
              : <span className="text-xs text-green-600 font-medium">Fields populated</span>}
            {!isExtracting && (
              <button
                type="button"
                onClick={() => { setExtractionFile(null); setExtractionError(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {extractionError && <p className="text-xs text-red-600">{extractionError}</p>}
      </div>

      {/* Vendor Information */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Vendor Information</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Vendor Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ABC Framing LLC" className={ic()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Main Email</label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="contact@vendor.com" className={ic()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Main Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" className={ic()} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
            <input type="text" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St, City, State" className={ic()} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Trade(s)</label>
            <TradeSelect costCodes={costCodes} selected={form.trades} onChange={(t) => set("trades", t)} />
            <p className="text-xs text-gray-400 mt-1">Select all trades that apply. Source: cost code master list.</p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Any relevant notes…" className={`${ic()} resize-none`} />
          </div>
        </div>
      </div>

      {/* Primary Contact */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Primary Contact</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3 md:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input type="text" value={form.primary_contact_name} onChange={(e) => set("primary_contact_name", e.target.value)} placeholder="Jane Smith" className={ic()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input type="email" value={form.primary_contact_email} onChange={(e) => set("primary_contact_email", e.target.value)} placeholder="jane@vendor.com" className={ic()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
            <input type="tel" value={form.primary_contact_phone} onChange={(e) => set("primary_contact_phone", e.target.value)} placeholder="(555) 123-4567" className={ic()} />
          </div>
        </div>
      </div>

      {/* Accounting Contact */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Accounting Contact</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-3 md:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input type="text" value={form.accounting_contact_name} onChange={(e) => set("accounting_contact_name", e.target.value)} placeholder="Bob Jones" className={ic()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input type="email" value={form.accounting_contact_email} onChange={(e) => set("accounting_contact_email", e.target.value)} placeholder="ap@vendor.com" className={ic()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
            <input type="tel" value={form.accounting_contact_phone} onChange={(e) => set("accounting_contact_phone", e.target.value)} placeholder="(555) 123-4568" className={ic()} />
          </div>
        </div>
      </div>

      {/* Compliance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Compliance</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">COI Expiry Date</label>
            <input
              type="date"
              value={form.coi_expiry_date}
              onChange={(e) => set("coi_expiry_date", e.target.value)}
              className={`${ic()} ${coiStatus === "expired" ? "border-red-300 bg-red-50" : coiStatus === "expiring" ? "border-amber-300 bg-amber-50" : ""}`}
            />
            <ExpiryIndicator label="COI" date={form.coi_expiry_date || null} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">License Expiry Date</label>
            <input
              type="date"
              value={form.license_expiry_date}
              onChange={(e) => set("license_expiry_date", e.target.value)}
              className={`${ic()} ${licenseStatus === "expired" ? "border-red-300 bg-red-50" : licenseStatus === "expiring" ? "border-amber-300 bg-amber-50" : ""}`}
            />
            <ExpiryIndicator label="License" date={form.license_expiry_date || null} />
          </div>
        </div>
      </div>

      {/* ACH / Banking */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">ACH / Banking</h3>
          <p className="text-xs text-gray-400 mt-0.5">Stored for future payment processing. Handle with care.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Bank Name</label>
            <input type="text" value={form.ach_bank_name} onChange={(e) => set("ach_bank_name", e.target.value)} placeholder="First National Bank" className={ic()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Account Type</label>
            <select value={form.ach_account_type} onChange={(e) => set("ach_account_type", e.target.value)} className={ic()}>
              <option value="">— Select —</option>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Routing Number</label>
            <input type="text" value={form.ach_routing_number} onChange={(e) => set("ach_routing_number", e.target.value)} placeholder="021000021" className={ic()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Account Number</label>
            <input type="text" value={form.ach_account_number} 