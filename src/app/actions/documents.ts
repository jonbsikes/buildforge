"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

const ALLOWED_FOLDERS = ["Plans", "Permits", "Contracts", "Lender", "Inspections", "Photos", "Field Photos", "Other"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function uploadDocument(formData: FormData) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const file = formData.get("file") as File;
  const projectId = (formData.get("project_id") as string) || null;
  const vendorId = (formData.get("vendor_id") as string) || null;
  const folder = formData.get("folder") as string;
  const notes = (formData.get("notes") as string) || null;

  if (!file || file.size === 0) throw new Error("No file provided");
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("File exceeds 25 MB limit");
  if (!ALLOWED_FOLDERS.includes(folder)) throw new Error(`Invalid folder: ${folder}`);

  // Sanitize filename to prevent path traversal
  const safeName = file.name.replace(/[/\\]/g, "_");

  const scope = projectId
    ? `project/${projectId}`
    : vendorId
    ? `vendor/${vendorId}`
    : "company";
  const storagePath = `${user.id}/${scope}/${folder}/${Date.now()}_${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false });

  if (uploadError) {
    console.error("Storage upload error:", uploadError.message);
    throw new Error(`File upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("documents")
    .getPublicUrl(storagePath);

  await supabase.from("documents").insert({
    project_id: projectId,
    vendor_id: vendorId,
    folder,
    file_name: file.name,
    storage_path: storagePath,
    file_size_kb: Math.ceil(file.size / 1024),
    mime_type: file.type,
    notes,
    uploaded_by: user.id,
  });

  revalidatePath("/documents");
}

export async function deleteDocument(id: string, storagePath: string | null) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) throw new Error(adminCheck.error);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Delete DB row first — an orphaned storage file is recoverable;
  // a dangling DB pointer to a missing file is not.
  await supabase.from("documents").delete().eq("id", id).eq("uploaded_by", user.id);

  if (storagePath) {
    const pathMatch = storagePath.match(/\/documents\/(.+)$/);
    if (pathMatch) {
      await supabase.storage.from("documents").remove([pathMatch[1]]);
    }
  }
  revalidatePath("/documents");
}
