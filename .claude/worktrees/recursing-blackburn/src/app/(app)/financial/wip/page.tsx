import Header from "@/components/layout/Header";
import WIPClient from "@/components/financial/WIPClient";

export const dynamic = "force-dynamic";

export default function WIPReportPage() {
  return (
    <>
      <Header title="WIP Report" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <WIPClient />
      </main>
    </>
  );
}
