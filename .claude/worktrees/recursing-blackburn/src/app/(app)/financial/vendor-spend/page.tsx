import Header from "@/components/layout/Header";
import VendorSpendClient from "@/components/financial/VendorSpendClient";

export const dynamic = "force-dynamic";

export default function VendorSpendPage() {
  return (
    <>
      <Header title="Vendor Spend Report" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <VendorSpendClient />
      </main>
    </>
  );
}
