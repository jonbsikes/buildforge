"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  const projectId = (formData.get("project_id") as string) || null;
  const folder = formData.get("folder") as string;
  const notes = (formData.get("notes") as string) || null;

  if (!file || file.size === 0) throw new Error("No file provided");

  // Upload to Supabase Storage bucket "documents"
  const storagePath = `${user.id}/${folder}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false });

  if (uploadError) {
    // If bucket doesn't exist yet, still record the metadata with a placeholder path
    console.error("Storage upload error:", uploadError.message);
  }

  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(storagePath);

  await supabase.from("documents").insert({
    project_id: projectId,
    folder,
    file_name: file.name,
    storage_path: urlData?.publicUrl ?? storagePath,
    file_size_kb: Math.ceil(file.size / 1024),
    mime_type: file.type,
    notes,
    uploaded_by: user.id,
  });

  revalidatePath("/documents");
}

export async function deleteDocument(id: string, storagePath: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Try to remove from storage
  if (storagePath) {
    // Extract relative path from full URL if needed
    const pathMatch = storagePath.match(/\/documents\/(.+)$/);
    if (pathMatch) {
      await supabase.storage.from("documents").remove([pathMatch[1]]);
    }
  }

  await supabase.from("documents").delete().eq("id", id).eq("uploaded_by", user.id);
  revalidatePath("/documents");
}
