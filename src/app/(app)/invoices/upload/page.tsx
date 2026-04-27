import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import InvoiceUploadForm from "./InvoiceUploadForm";


export default async function InvoiceUploadPage() {
  const supabase = await createClient();

  const [projectsRes, costCodesRes, vendorsRes] = await Promise.all([
    supabase.from("projects").select("id, name, project_type, address, subdivision, block, lot").order("name"),
    supabase.from("cost_codes").select("code, category, name, project_type").order("sort_order"),
    supabase.from("vendors").select("id, name").eq("is_active", true).order("name"),
  ]);

  const projects = projectsRes.data ?? [];
  const costCodes = costCodesRes.data ?? [];
  const vendors = vendorsRes.data ?? [];
  const hasAI = !!process.env.ANTHROPIC_API_KEY;

  return (
    <>
      <Header title="New Invoice" />
      <InvoiceUploadForm
        projects={projects as Parameters<typeof InvoiceUploadForm>[0]["projects"]}
        costCodes={costCodes as Parameters<typeof InvoiceUploadForm>[0]["costCodes"]}
        vendors={vendors as Parameters<typeof InvoiceUploadForm>[0]["vendors"]}
        hasAI={hasAI}
      />
    </>
  );
}
