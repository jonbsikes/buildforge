import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import BankAccountsClient from "@/components/banking/BankAccountsClient";
import ReadOnlyBanner from "@/components/ui/ReadOnlyBanner";


export default async function BankAccountsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, account_name, account_last_four, account_type, notes")
    .eq("is_active", true)
    .order("bank_name");

  const accounts = data ?? [];

  return (
    <>
      <Header title="Bank Accounts" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <ReadOnlyBanner />
          <BankAccountsClient initialAccounts={accounts} />
        </div>
      </main>
    </>
  );
}
