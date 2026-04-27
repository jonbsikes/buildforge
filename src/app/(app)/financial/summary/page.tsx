import Header from "@/components/layout/Header";
import FinancialSummaryClient from "@/components/financial/FinancialSummaryClient";


export default function FinancialSummaryPage() {
  return (
    <>
      <Header title="Financial Summary" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <FinancialSummaryClient />
      </main>
    </>
  );
}
