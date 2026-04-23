"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadFieldLogPhoto, deleteFieldLogPhoto } from "@/app/actions/field-logs";
import ConfirmButton from "@/components/ui/ConfirmButton";

export interface FieldLogPhoto {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  created_at: string;
  url?: string;
}

interface Props {
  projectId: string;
  fieldLogId: string;
  logDate: string;
  initialPhotos?: FieldLogPhoto[];
  readOnly?: boolean;
}

export default function FieldLogPhotos({
  projectId,
  fieldLogId,
  logDate,
  initialPhotos = [],
  readOnly = false,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [photos, setPhotos] = useState<FieldLogPhoto[]>(initialPhotos);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError(`${file.name}: only image files are allowed.`);
        continue;
      }
      if (file.size > 25 * 1024 * 1024) {
        setError(`${file.name} is larger than 25MB.`);
        continue;
      }

      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      fd.append("field_log_id", fieldLogId);
      fd.append("log_date", logDate);

      // Optimistic placeholder — use a local object URL for instant preview.
      const tempId = `tmp-${Date.now()}-${file.name}`;
      const previewUrl = URL.createObjectURL(file);
      setPhotos((prev) => [
        ...prev,
        {
          id: tempId,
          file_name: file.name,
          storage_path: "",
          mime_type: file.type,
          created_at: new Date().toISOString(),
          url: previewUrl,
        },
      ]);

      startTransition(async () => {
        try {
          await uploadFieldLogPhoto(fd);
          // Pull the fresh list, then sign each storage_path so the <img> can load
          // it from the private bucket.
          const { data } = await supabase
            .from("documents")
            .select("id, file_name, storage_path, mime_type, created_at")
            .eq("field_log_id", fieldLogId)
            .order("created_at", { ascending: true });
          const rows = (data ?? []) as FieldLogPhoto[];
          const signed = await Promise.all(
            rows.map(async (p) => {
              const storagePath = p.storage_path ?? "";
              let relPath = storagePath.includes("/object/")
                ? storagePath
                    .replace(/^.*\/object\/(?:public|sign)\/documents\//, "")
                    .split("?")[0]
                : storagePath;
              try { relPath = decodeURIComponent(relPath); } catch {}
              const { data: sig } = await supabase.storage
                .from("documents")
                .createSignedUrl(relPath, 3600);
              return { ...p, storage_path: relPath, url: sig?.signedUrl ?? "" };
            }),
          );
          setPhotos(signed);
          router.refresh();
        } catch (e) {
          setPhotos((prev) => prev.filter((p) => p.id !== tempId));
          setError(e instanceof Error ? e.message : "Upload failed.");
        }
      });
    }
  }

  async function handleDelete(photo: FieldLogPhoto) {
    const prev = photos;
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
    try {
      await deleteFieldLogPhoto(photo.id, photo.storage_path);
      router.refresh();
    } catch (e) {
      setPhotos(prev);
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
            >
              <a
                href={photo.url || photo.storage_path}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full"
              >
                {/* next/image blocked for arbitrary hosts; use plain img */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url || photo.storage_path}
                  alt={photo.file_name}
                  className="w-full h-full object-cover"
                />
              </a>
              {!readOnly && (
                <ConfirmButton
                  trigger={<Trash2 size={14} />}
                  title={`Delete ${photo.file_name}?`}
                  body="This will permanently remove the photo."
                  confirmLabel="Delete"
                  tone="danger"
                  onConfirm={async () => {
                    await handleDelete(photo);
                  }}
                  triggerClassName="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-white/90 text-gray-600 hover:text-red-600 opacity-0 group-hover:opacity-100 transition shadow"
                  ariaLabel="Delete photo"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
            <Camera size={15} />
            Take Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
            <Upload size={15} />
            Upload
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {isPending && (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Uploading…
            </span>
          )}
        </div>
      )}

      {photos.length === 0 && readOnly && (
        <p className="text-sm text-gray-400">No photos on this log.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
