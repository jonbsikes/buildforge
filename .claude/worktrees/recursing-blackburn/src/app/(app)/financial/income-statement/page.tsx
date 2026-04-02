import Header from "@/components/layout/Header";
import IncomeStatementClient from "@/components/financial/IncomeStatementClient";

export const dynamic = "force-dynamic";

export default function IncomeStatementPage() {
  return (
    <>
      <Header title="Income Statement" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <IncomeStatementClient />
      </main>
    </>
  );
}
