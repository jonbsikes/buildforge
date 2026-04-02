import Header from "@/components/layout/Header";
import JobCostReportClient from "@/components/reports/JobCostReportClient";

export const dynamic = "force-dynamic";

export default function JobCostReportPage() {
  return (
    <>
      <Header title="Job Cost Report" />
      <main className="flex-1 p-6 overflow-auto">
        <JobCostReportClient />
      </main>
    </>
  );
}
