import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import NotificationsClient from "./NotificationsClient";


export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <Header title="Notifications" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <NotificationsClient notifications={notifications ?? []} />
      </main>
    </>
  );
}
