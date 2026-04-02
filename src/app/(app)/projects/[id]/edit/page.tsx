import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import EditProjectForm from "@/components/projects/EditProjectForm";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProjectPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [projectResult, lendersResult, loansResult] = await Promise.all([
    supabase
      .from("projects")
      .select(`
        id, name, address, status, project_type,
        subdivision, block, lot, lot_size_acres, plan, home_size_sf,
        size_acres, number_of_lots, number_of_phases,
        start_date, lender_id
      `)
      .eq("id", id)
      .single(),

    supabase
      .from("contacts")
      .select("id, name")
      .eq("type", "lender")
      .order("name"),

    supabase
      .from("loans")
      .select("id, loan_number, loan_amount, status")
      .eq("project_id", id)
      .order("created_at"),
  ]);

  if (!projectResult.data) notFound();

  const project = projectResult.data;
  const lenders = lendersResult.data ?? [];
  const loans = loansResult.data ?? [];

  return (
    <>
      <Header title={`Edit: ${project.name}`} />
      <main className="flex-1 p-4 lg:p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <Link
            href={`/projects/${id}`}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors mb-5 block"
          >
            ← {project.name}
          </Link>
          <EditProjectForm
            project={project}
            lenders={lenders}
            existingLoans={loans}
          />
        </div>
      </main>
    </>
  );
}
