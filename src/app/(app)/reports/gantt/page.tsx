import Header from "@/components/layout/Header";
import GanttReportClient from "@/components/reports/GanttReportClient";

export const dynamic = "force-dynamic";

export default function GanttReportPage() {
  return (
    <>
      <Header title="Gantt Report" />
      <main className="flex-1 p-6 overflow-auto">
        <GanttReportClient />
      </main>
    </>
  );
}
