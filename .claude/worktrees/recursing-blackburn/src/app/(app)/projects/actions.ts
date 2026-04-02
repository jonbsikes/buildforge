"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const insert: ProjectInsert = {
    user_id: user.id,
    name: formData.get("name") as string,
    address: (formData.get("address") as string) || null,
    description: (formData.get("description") as string) || null,
    project_type: (formData.get("project_type") as Database["public"]["Enums"]["project_type"]) || "home_construction",
    status: (formData.get("status") as Database["public"]["Enums"]["project_status"]) || "planning",
    total_budget: parseFloat((formData.get("total_budget") as string) || "0"),
    start_date: (formData.get("start_date") as string) || null,
    end_date: (formData.get("end_date") as string) || null,
  };

  const { data, error } = await supabase.from("projects").insert(insert).select("id").single();
  if (error) throw new Error(error.message);

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function updateProject(id: string, formData: FormData) {
  const supabase = await createClient();

  const update: ProjectUpdate = {
    name: formData.get("name") as string,
    address: (formData.get("address") as string) || null,
    description: (formData.get("description") as string) || null,
    project_type: formData.get("project_type") as Database["public"]["Enums"]["project_type"],
    status: formData.get("status") as Database["public"]["Enums"]["project_status"],
    total_budget: parseFloat((formData.get("total_budget") as string) || "0"),
    start_date: (formData.get("start_date") as string) || null,
    end_date: (formData.get("end_date") as string) || null,
  };

  const { error } = await supabase.from("projects").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/projects");
  redirect("/projects");
}
