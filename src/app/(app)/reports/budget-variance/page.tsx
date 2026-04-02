import Header from "@/components/layout/Header";
import BudgetVarianceReportClient from "@/components/reports/BudgetVarianceReportClient";

export const dynamic = "force-dynamic";

export default function BudgetVarianceReportPage() {
  return (
    <>
      <Header title="Budget Variance Report" />
      <main className="flex-1 p-6 overflow-auto">
        <BudgetVarianceReportClient />
      </main>
    </>
  );
}
