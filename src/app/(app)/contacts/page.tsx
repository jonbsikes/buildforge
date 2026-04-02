import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { BookUser, Plus } from "lucide-react";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

const typeLabels: Record<string, string> = {
  lender: "Lender",
  title_company: "Title Company",
  architect: "Architect",
  engineer: "Engineer",
  inspector: "Inspector",
  municipality: "Municipality",
  realtor: "Realtor",
  other: "Other",
};

const typeColors: Record<string, string> = {
  lender: "bg-blue-100 text-blue-700",
  title_company: "bg-violet-100 text-violet-700",
  architect: "bg-teal-100 text-teal-700",
  engineer: "bg-cyan-100 text-cyan-700",
  inspector: "bg-orange-100 text-orange-700",
  municipality: "bg-gray-100 text-gray-600",
  realtor: "bg-green-100 text-green-700",
  other: "bg-gray-100 text-gray-600",
};

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("*").order("name");
  const contacts = (data ?? []) as Contact[];

  const grouped = contacts.reduce<Record<string, Contact[]>>((acc, c) => {
    const t = c.type ?? "other";
    if (!acc[t]) acc[t] = [];
    acc[t].push(c);
    return acc;
  }, {});

  return (
    <>
      <Header title="Contacts" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</p>
          <Link href="/contacts/new"
            className="inline-flex items-center gap-2 bg-amber-500 text-gray-900 font-medium px-4 py-2 rounded-lg text-sm hover:bg-amber-400 transition-colors">
            <Plus size={15} /> Add Contact
          </Link>
        </div>

        {contacts.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
            <BookUser size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No contacts yet.</p>
            <Link href="/contacts/new" className="mt-2 inline-block text-sm text-amber-600 hover:underline">Add your first contact</Link>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([type, group]) => (
              <div key={type} className="bg-white rounded-xl border border-gray-200">
                <div className="px-5 py-3 border-b border-gray-100">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColors[type] ?? "bg-gray-100 text-gray-600"}`}>
                    {typeLabels[type] ?? type}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {group.map((c) => (
                    <div key={c.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{c.name}</p>
                        {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
                      </div>
                      <div className="text-xs text-gray-500 text-right">
                        {c.phone && <p>{c.phone}</p>}
                        {c.email && <p>{c.email}</p>}
                      </div>
                      <Link href={`/contacts/${c.id}`} className="text-xs text-amber-600 hover:underline shrink-0">View →</Link>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
