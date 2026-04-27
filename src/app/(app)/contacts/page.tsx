import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ContactsClient from "@/components/contacts/ContactsClient";


export default async function ContactsPage() {
  const supabase = await createClient();

  const [{ data: contacts }, { data: loans }, { data: projects }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, name, type, email, phone")
      .order("name"),
    supabase.from("loans").select("id, lender_id, status"),
    supabase.from("projects").select("id, lender_id, status"),
  ]);

  // Per UI Review § 11 #65: each contact card shows how many active loans /
  // projects it's linked to.
  const linkedLoans = new Map<string, number>();
  for (const l of loans ?? []) {
    if (l.lender_id && l.status === "active") {
      linkedLoans.set(l.lender_id, (linkedLoans.get(l.lender_id) ?? 0) + 1);
    }
  }
  const linkedProjects = new Map<string, number>();
  for (const p of projects ?? []) {
    if (p.lender_id && (p.status === "active" || p.status === "pre_construction")) {
      linkedProjects.set(p.lender_id, (linkedProjects.get(p.lender_id) ?? 0) + 1);
    }
  }

  const enriched = (contacts ?? []).map((c) => ({
    ...c,
    active_loans: linkedLoans.get(c.id) ?? 0,
    active_projects: linkedProjects.get(c.id) ?? 0,
  }));

  return (
    <>
      <Header title="Contacts" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <ContactsClient contacts={enriched} />
      </main>
    </>
  );
}
