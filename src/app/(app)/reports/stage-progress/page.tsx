import Header from "@/components/layout/Header";
import StageProgressReportClient from "@/components/reports/StageProgressReportClient";

export const dynamic = "force-dynamic";

export default function StageProgressPage() {
  return (
    <>
      <Header title="Stage Progress" />
      <main className="flex-1 p-6 overflow-auto">
        <StageProgressReportClient />
      </main>
    </>
  );
}
