"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, Mail, Phone, Users } from "lucide-react";
import {
  createContact,
  updateContact,
  deleteContact,
  type ContactInput,
} from "@/app/actions/contacts";
import EmptyState from "@/components/ui/EmptyState";
import FilterChipRail, { type FilterChip } from "@/components/ui/FilterChipRail";

interface Contact {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  active_loans?: number;
  active_projects?: number;
}

const TYPE_OPTIONS = [
  { value: "lender", label: "Lender" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];


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

type ContactType = "all" | "lender" | "owner" | "other";

export default function ContactsClient({ contacts }: { contacts: Contact[] }) {
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<ContactType>("all");

  const counts = useMemo(() => {
    const map = { all: contacts.length, lender: 0, owner: 0, other: 0 };
    for (const c of contacts) {
      if (c.type === "lender") map.lender += 1;
      else if (c.type === "owner") map.owner += 1;
      else map.other += 1;
    }
    return map;
  }, [contacts]);

  const visibleContacts = useMemo(() => {
    if (filter === "all") return contacts;
    return contacts.filter((c) => c.type === filter || (filter === "other" && c.type !== "lender" && c.type !== "owner"));
  }, [contacts, filter]);

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

      {/* Filter chips */}
      {contacts.length > 0 && (
        <div className="mb-5">
          <FilterChipRail<ContactType>
            chips={[
              { id: "all", label: "All", count: counts.all },
              { id: "lender", label: "Lenders", count: counts.lender },
              { id: "owner", label: "Owners", count: counts.owner },
              { id: "other", label: "Other", count: counts.other },
            ] as FilterChip<ContactType>[]}
            active={filter}
            onChange={setFilter}
          />
        </div>
      )}

      {/* Card grid */}
      {contacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200">
          <EmptyState
            icon={<Users size={20} />}
            title="No contacts yet"
            description="Contacts are lenders, owners, and others tied to projects and loans. Lenders show up on a project's banking and draw flows."
            primary={{ label: "+ Add your first contact", onClick: openNew }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleContacts.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-400 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{c.type}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(c)}
                    aria-label={`Edit ${c.name}`}
                    className="p-1.5 text-gray-400 hover:text-[#4272EF] hover:bg-blue-50 rounded transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => openDelete(c)}
                    aria-label={`Delete ${c.name}`}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-gray-500">
                {c.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail size={12} className="flex-shrink-0" />
                    <a href={`mailto:${c.email}`} className="hover:text-[#4272EF] truncate">{c.email}</a>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone size={12} className="flex-shrink-0" />
                    <span>{c.phone}</span>
                  </div>
                )}
              </div>
              {(c.active_loans !== undefined || c.active_projects !== undefined) &&
                ((c.active_loans ?? 0) > 0 || (c.active_projects ?? 0) > 0) && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {(c.active_loans ?? 0) > 0 && (
                      <span>
                        <span className="font-semibold text-gray-700 tabular-nums">{c.active_loans}</span>{" "}
                        active loan{c.active_loans !== 1 ? "s" : ""}
                      </span>
                    )}
                    {(c.active_projects ?? 0) > 0 && (
                      <span>
                        <span className="font-semibold text-gray-700 tabular-nums">{c.active_projects}</span>{" "}
                        active project{c.active_projects !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}
            </div>
          ))}
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
