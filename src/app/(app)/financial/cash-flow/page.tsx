import Header from "@/components/layout/Header";
import CashFlowClient from "@/components/financial/CashFlowClient";

export const dynamic = "force-dynamic";

export default function CashFlowPage() {
  return (
    <>
      <Header title="Cash Flow Statement" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <CashFlowClient />
      </main>
    </>
  );
}
