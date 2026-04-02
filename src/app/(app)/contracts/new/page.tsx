import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import ContractForm from "@/components/contracts/ContractForm";

export const dynamic = "force-dynamic";

export default async function NewContractPage() {
  const supabase = await createClient();

  const [vendorsResult, projectsResult, costCodesResult] = await Promise.all([
    supabase.from("vendors").select("id, name").order("name"),
    supabase.from("projects").select("id, name, project_type").order("name"),
    supabase.from("cost_codes").select("id, code, name, project_type").not("project_type", "is", null).order("code"),
  ]);

  return (
    <>
      <Header title="New Contract" />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-4">
          <Link href="/contracts" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Contracts
          </Link>
          <ContractForm
            vendors={vendorsResult.data ?? []}
            projects={projectsResult.data ?? []}
            costCodes={(costCodesResult.data ?? []).map((c) => ({
              id: c.id,
              code: c.code,
              name: c.name,
              project_type: c.project_type,
            }))}
          />
        </div>
      </main>
    </>
  );
}
