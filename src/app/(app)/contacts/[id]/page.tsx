"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";
import type { Database } from "@/types/database";

type ContactType = "lender" | "owner" | "other";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const supabase = createClient();

  const [contact, setContact] = useState<Contact | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>({});

  useEffect(() => {
    supabase.from("contacts").select("*").eq("id", id).single().then(({ data }) => {
      if (data) { setContact(data as Contact); setForm(data as Contact); }
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    await supabase.from("contacts").update(form).eq("id", id);
    setContact((prev) => prev ? { ...prev, ...form } : prev);
    setEditing(false);
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this contact?")) return;
    await supabase.from("contacts").delete().eq("id", id);
    router.push("/contacts");
  }

  if (!contact) return <main className="flex-1 p-6"><div className="text-gray-400 text-sm">Loading…</div></main>;

  const fields: { key: keyof Contact; label: string; type?: string }[] = [
    { key: "name", label: "Name" },
    { key: "company", label: "Company" },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "email", label: "Email", type: "email" },
    { key: "notes", label: "Notes" },
  ];

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-xl mx-auto">
        <Link href="/contacts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
          <ArrowLeft size={15} /> Contacts
        </Link>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{contact.name}</h1>
            <p className="text-sm text-gray-500 capitalize">{contact.type?.replace("_", " ")}</p>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <button onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600">
                <Pencil size={14} /> Edit
              </button>
            ) : (
              <>
                <button onClick={handleSave} disabled={saving}
                  className="inline-flex items-center gap-1.5 text-sm bg-amber-500 text-gray-900 px-3 py-1.5 rounded-lg hover:bg-amber-400">
                  <Check size={14} /> {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => { setEditing(false); setForm(contact); }}
                  className="inline-flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600">
                  <X size={14} /> Cancel
                </button>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 mb-4">
          {editing && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={(form.type as string) ?? "other"} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ContactType }))}
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
          )}
          {fields.map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              {editing ? (
                <input type={type ?? "text"} value={(form[key] as string) ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value || null }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              ) : (
                <p className="text-sm text-gray-900">{(contact[key] as string | null) ?? <span className="text-gray-400">—</span>}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700 hover:underline">Delete contact</button>
        </div>
      </div>
    </main>
  );
}
