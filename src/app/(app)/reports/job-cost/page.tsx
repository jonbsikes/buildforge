import Header from "@/components/layout/Header";
import JobCostReportClient from "@/components/reports/JobCostReportClient";


export default function JobCostReportPage() {
  return (
    <>
      <Header title="Job Cost Report" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <JobCostReportClient />
      </main>
    </>
  );
}
