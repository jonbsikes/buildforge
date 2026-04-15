import Header from "@/components/layout/Header";
import PaymentRegisterClient from "@/components/payments/PaymentRegisterClient";
import { getPayments, getPayableInvoices } from "@/app/actions/payments";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";

export const dynamic = "force-dynamic";

export default async function PaymentRegisterPage() {
  const [paymentsResult, payableResult] = await Promise.all([
    getPayments(),
    getPayableInvoices(),
  ]);

  return (
    <>
      <Header title="Payment Register" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <ReadOnlyBanner />
        <PaymentRegisterClient
          initialPayments={paymentsResult.payments ?? []}
          payableInvoices={payableResult.invoices ?? []}
        />
      </main>
    </>
  );
}
