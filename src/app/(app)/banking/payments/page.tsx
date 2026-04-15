import Header from "@/components/layout/Header";
import PaymentRegisterClient from "@/components/payments/PaymentRegisterClient";
import { getPayments, getPayableInvoices, getReleasedUnlinkedInvoices } from "@/app/actions/payments";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";

export const dynamic = "force-dynamic";

export default async function PaymentRegisterPage() {
  const [paymentsResult, payableResult, releasedResult] = await Promise.all([
    getPayments(),
    getPayableInvoices(),
    getReleasedUnlinkedInvoices(),
  ]);

  return (
    <>
      <Header title="Payment Register" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <ReadOnlyBanner />
        <PaymentRegisterClient
          initialPayments={paymentsResult.payments ?? []}
          payableInvoices={payableResult.invoices ?? []}
          releasedUnlinkedInvoices={releasedResult.invoices ?? []}
        />
      </main>
    </>
  );
}
