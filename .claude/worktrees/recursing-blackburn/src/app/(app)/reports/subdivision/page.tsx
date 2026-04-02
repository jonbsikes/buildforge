import Header from "@/components/layout/Header";
import SubdivisionOverviewClient from "@/components/reports/SubdivisionOverviewClient";

export const dynamic = "force-dynamic";

export default function SubdivisionOverviewPage() {
  return (
    <>
      <Header title="Subdivision Overview" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <SubdivisionOverviewClient />
      </main>
    </>
  );
}
