"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import {
  createContact,
  updateContact,
  deleteContact,
  type ContactInput,
} from "@/app/actions/contacts";

interface Contact {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
}

const TYPE_OPTIONS = [
  { value: "lender", label: "Lender" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];

const TYPE_BADGE: Record<string, string> = {
  lender: "bg-blue-100 text-blue-700",
  owner: "bg-green-100 text-green-700",
  other: "bg-gray-100 text-gray-600",
};

const EMPTY_FORM: ContactInput = {
  name: "",
  type: "lender",
  email: "",
  phone: "",
};

function ic(err = false) {
  return `w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF] focus:border-transparent ${
    err ? "border-red-400" : "border-gray-300"
  }`;
}

export default function ContactsClient({ contacts }: { contacts: Contact[] }) {
  const [isPending, startTransition] = useTransition();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactInput>(EMPTY_FORM);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setNameError(null);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditing(contact);
    setForm({
      name: contact.name,
      type: contact.type,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
    });
    setNameError(null);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleSave() {
    if (!form.name.trim()) {
      setNameError("Name is required");
      return;
    }
    setNameError(null);
    setFormError(null);

    startTransition(async () => {
      const input: ContactInput = {
        name: form.name,
        type: form.type,
        email: form.email || null,
        phone: form.phone || null,
      };

      const result = editing
        ? await updateContact(editing.id, input)
        : await createContact(input);

      if (result.error) {
        setFormError(result.error);
      } else {
        closeModal();
      }
    });
  }

  function openDelete(contact: Contact) {
    setDeleteTarget(contact);
    setDeleteError(null);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startDeleteTransition(async () => {
      const result = await deleteContact(deleteTarget.id);
      if (result.error) {
        setDeleteError(result.error);
      } else {
        setDeleteTarget(null);
      }
    });
  }

  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">
          {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
        >
          <Plus size={16} />
          New Contact
        </button>
      </div>

      {/* Table */}
      {contacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-600 mb-1">No contacts yet</p>
          <p className="text-sm text-gray-400">
            Add lenders, owners, or other contacts to get started.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Type
                </th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Email
                </th>
                <th className="text-left px-5 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                  Phone
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{c.name}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                        TYPE_BADGE[c.type] ?? TYPE_BADGE.other
                      }`}
                    >
                      {c.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{c.email ?? "—"}</td>
                  <td className="px-5 py-3.5 text-gray-500">{c.phone ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(c)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#4272EF] hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                      <button
                        onClick={() => openDelete(c)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeModal}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">
                {editing ? "Edit Contact" : "New Contact"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, name: e.target.value }));
                    if (nameError) setNameError(null);
                  }}
                  className={ic(!!nameError)}
                  placeholder="Full name or company"
                  autoFocus
                />
                {nameError && (
                  <p className="mt-1 text-xs text-red-600">{nameError}</p>
                )}
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  className={ic()}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className={ic()}
                  placeholder="email@example.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone
                </label>
                <input
                  type="tel"
                  value={form.phone ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className={ic()}
                  placeholder="(555) 000-0000"
                />
              </div>

              {formError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Delete Contact
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete{" "}
              <span className="font-semibold">{deleteTarget.name}</span>? This
              cannot be undone.
            </p>

            {deleteError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
