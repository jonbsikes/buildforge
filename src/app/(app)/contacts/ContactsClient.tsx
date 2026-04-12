"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { createContact, updateContact, deleteContact } from "./actions";
import type { Database } from "@/types/database";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

const CONTACT_TYPES = ["lender", "owner", "other"] as const;

const TYPE_COLORS: Record<string, string> = {
  lender: "bg-blue-50 text-blue-700",
  owner: "bg-green-50 text-green-700",
  other: "bg-gray-100 text-gray-600",
};

function ContactForm({ contact, onDone }: { contact?: Contact; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const isEdit = !!contact;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          if (isEdit) await updateContact(contact.id, fd);
          else await createContact(fd);
          onDone();
        });
      }}
      className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4"
    >
      <h3 className="font-semibold text-gray-900">{isEdit ? "Edit Contact" : "New Contact"}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          name="name"
          required
          defaultValue={contact?.name ?? ""}
          placeholder="Name *"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <select
          name="type"
          defaultValue={contact?.type ?? "other"}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          {CONTACT_TYPES.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <input
          name="company"
          defaultValue={contact?.company ?? ""}
          placeholder="Company"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <input
          name="phone"
          defaultValue={contact?.phone ?? ""}
          placeholder="Phone"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <input
          name="email"
          type="email"
          defaultValue={contact?.email ?? ""}
          placeholder="Email"
          className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <textarea
          name="notes"
          defaultValue={contact?.notes ?? ""}
          placeholder="Notes (optional)"
          rows={2}
          className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "#4272EF" }}
        >
          {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Contact"}
        </button>
      </div>
    </form>
  );
}

export default function ContactsClient({ contacts }: { contacts: Contact[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [, startTransition] = useTransition();

  const filtered = filterType ? contacts.filter((c) => c.type === filterType) : contacts;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {["", ...CONTACT_TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filterType === t
                  ? "text-white border-transparent"
                  : "text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
              style={filterType === t ? { backgroundColor: "#4272EF" } : undefined}
            >
              {t === "" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button
            onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
            style={{ backgroundColor: "#4272EF" }}
          >
            <Plus size={15} /> Add Contact
          </button>
        </div>
      </div>

      {showAdd && <ContactForm onDone={() => setShowAdd(false)} />}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center">
            <Users size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No contacts found.</p>
          </div>
        ) : (
          filtered.map((c) =>
            editingId === c.id ? (
              <ContactForm key={c.id} contact={c} onDone={() => setEditingId(null)} />
            ) : (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{c.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[c.type] ?? "bg-gray-100 text-gray-600"}`}>
                        {c.type}
                      </span>
                    </div>
                    {c.company && <p className="text-sm text-gray-600">{c.company}</p>}
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500 mt-0.5">
                      {c.email && <span>{c.email}</span>}
                      {c.phone && <span>{c.phone}</span>}
                    </div>
                    {c.notes && <p className="text-xs text-gray-400 mt-1">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setEditingId(c.id)} className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                      Edit
                    </button>
                    <button
                      onClick={() => startTransition(async () => { if (confirm(`Delete ${c.name}?`)) await deleteContact(c.id); })}
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
