import Header from "@/components/layout/Header";
import TaxExportClient from "@/components/financial/TaxExportClient";

export const dynamic = "force-dynamic";

export default function TaxExportPage() {
  return (
    <>
      <Header title="Tax Package Export" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <TaxExportClient />
      </main>
    </>
  );
}
