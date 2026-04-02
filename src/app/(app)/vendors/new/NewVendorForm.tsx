// @ts-nocheck
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { VendorType } from "@/types/database";

export default function NewVendorForm() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    type: "subcontractor" as VendorType,
    contact_name: "",
    phone: "",
    email: "",
    address: "",
    w9_on_file: false,
    coi_expiry: "",
    license_number: "",
    license_expiry: "",
    notes: "",
  });

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { error: err } = await supabase.from("vendors").insert({
      user_id: user.id,
      name: form.name,
      type: form.type,
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      w9_on_file: form.w9_on_file,
      coi_expiry: form.coi_expiry || null,
      license_number: form.license_number || null,
      license_expiry: form.license_expiry || null,
      notes: form.notes || null,
    });

    if (err) { setError(err.message); setSaving(false); }
    else router.push("/vendors");
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <Link href="/vendors" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Vendors
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">New Vendor</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Company / Vendor Name <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={(e) => set("name", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.type} onChange={(e) => set("type", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="subcontractor">Subcontractor</option>
                  <option value="supplier">Supplier</option>
                  <option value="utility">Utility</option>
                  <option value="professional">Professional</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                <input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input value={form.address} onChange={(e) => set("address", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Compliance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.w9_on_file} onChange={(e) => set("w9_on_file", e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400" />
                    <span className="text-sm text-gray-700">W-9 on file</span>
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">COI Expiry</label>
                  <input type="date" value={form.coi_expiry} onChange={(e) => set("coi_expiry", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                  <input value={form.license_number} onChange={(e) => set("license_number", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">License Expiry</label>
                  <input type="date" value={form.license_expiry} onChange={(e) => set("license_expiry", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-amber-500 text-gray-900 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Add Vendor"}
              </button>
              <Link href="/vendors"
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    