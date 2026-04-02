import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import ContractForm from "@/components/contracts/ContractForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditContractPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [contractResult, vendorsResult, projectsResult, costCodesResult] = await Promise.all([
    supabase.from("contracts").select("*").eq("id", id).single(),
    supabase.from("vendors").select("id, name").order("name"),
    supabase.from("projects").select("id, name, project_type").order("name"),
    supabase.from("cost_codes").select("id, code, name, project_type").not("project_type", "is", null).order("code"),
  ]);

  if (!contractResult.data) notFound();
  const c = contractResult.data;

  return (
    <>
      <Header title="Edit Contract" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-4">
          <Link href="/contracts" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            ← Contracts
          </Link>
          <ContractForm
            editId={id}
            vendors={vendorsResult.data ?? []}
            projects={projectsResult.data ?? []}
            costCodes={(costCodesResult.data ?? []).map((cc) => ({
              id: cc.id,
              code: cc.code,
              name: cc.name,
              project_type: cc.project_type,
            }))}
            defaults={{
              project_id:   c.project_id,
              description:  c.description,
              vendor_id:    c.vendor_id ?? "",
              cost_code_id: c.cost_code_id ?? "",
              amount:       c.amount != null ? String(c.amount) : "",
              status:       c.status,
              signed_date:  c.signed_date ?? "",
              notes:        c.notes ?? "",
            }}
          />
        </div>
      </main>
    </>
  );
}
