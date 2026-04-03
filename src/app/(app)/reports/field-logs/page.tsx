import Header from "@/components/layout/Header";
import FieldLogsReportClient from "@/components/reports/FieldLogsReportClient";

export const dynamic = "force-dynamic";

export default function FieldLogsReportPage() {
  return (
    <>
      <Header title="Field Logs Report" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <FieldLogsReportClient />
      </main>
    </>
  );
}
