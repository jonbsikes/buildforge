// @ts-nocheck
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ContactType } from "@/types/database";

export default function NewContactForm() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", type: "other" as ContactType, company: "",
    phone: "", email: "", address: "", notes: "",
  });

  function set(field: string, value: string) { setForm((f) => ({ ...f, [field]: value })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { error: err } = await supabase.from("contacts").insert({
      user_id: user.id,
      name: form.name,
      type: form.type,
      company: form.company || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
    });
    if (err) { setError(err.message); setSaving(false); }
    else router.push("/contacts");
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-xl mx-auto">
        <Link href="/contacts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Contacts
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">New Contact</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
              <input required value={form.name} onChange={(e) => set("name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.type} onChange={(e) => set("type", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="lender">Lender</option>
                  <option value="title_company">Title Company</option>
                  <option value="architect">Architect</option>
                  <option value="engineer">Engineer</option>
                  <option value="inspector">Inspector</option>
                  <option value="municipality">Municipality</option>
                  <option value="realtor">Realtor</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <input value={form.company} onChange={(e) => set("company", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input value={form.address} onChange={(e) => set("address", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-amber-500 text-gray-900 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Add Contact"}
              </button>
              <Link href="/contacts"
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    