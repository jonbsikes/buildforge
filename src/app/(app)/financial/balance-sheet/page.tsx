import Header from "@/components/layout/Header";
import BalanceSheetClient from "@/components/financial/BalanceSheetClient";

export const dynamic = "force-dynamic";

export default function BalanceSheetPage() {
  return (
    <>
      <Header title="Balance Sheet" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <BalanceSheetClient />
      </main>
    </>
  );
}
