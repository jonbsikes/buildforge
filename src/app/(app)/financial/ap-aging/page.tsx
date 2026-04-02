import Header from "@/components/layout/Header";
import APAgingClient from "@/components/financial/APAgingClient";

export const dynamic = "force-dynamic";

export default function APAgingPage() {
  return (
    <>
      <Header title="AP Aging" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <APAgingClient />
      </main>
    </>
  );
}
