import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import ContactsClient from "@/components/contacts/ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const supabase = await createClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, type, email, phone")
    .order("name");

  return (
    <>
      <Header title="Contacts" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <ContactsClient contacts={contacts ?? []} />
      </main>
    </>
  