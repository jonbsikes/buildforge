import Header from "@/components/layout/Header";
import JournalEntriesClient from "@/components/financial/JournalEntriesClient";

export const dynamic = "force-dynamic";

export default function JournalEntriesPage() {
  return (
    <>
      <Header title="Journal Entries" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <JournalEntriesClient />
      </main>
    </>
  );
}
