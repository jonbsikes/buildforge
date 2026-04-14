"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadFieldLogPhoto, deleteFieldLogPhoto } from "@/app/(app)/field-logs/actions";

export interface FieldLogPhoto {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  created_at: string;
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

      // Optimistic placeholder
      const tempId = `tmp-${Date.now()}-${file.name}`;
      const previewUrl = URL.createObjectURL(file);
      setPhotos((prev) => [
        ...prev,
        {
          id: tempId,
          file_name: file.name,
          storage_path: previewUrl,
          mime_type: file.type,
          created_at: new Date().toISOString(),
        },
      ]);

      startTransition(async () => {
        try {
          await uploadFieldLogPhoto(fd);
          // Pull the fresh list straight from Supabase so the optimistic row is
          // replaced with the real record (with real id + public url).
          const { data } = await supabase
            .from("documents")
            .select("id, file_name, storage_path, mime_type, created_at")
            .eq("field_log_id", fieldLogId)
            .order("created_at", { ascending: true });
          setPhotos((data as FieldLogPhoto[]) ?? []);
          router.refresh();
        } catch (e) {
          setPhotos((prev) => prev.filter((p) => p.id !== tempId));
          setError(e instanceof Error ? e.message : "Upload failed.");
        }
      });
    }
  }

  async function handleDelete(photo: FieldLogPhoto) {
    if (!confirm(`Delete ${photo.file_name}?`)) return;
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
                href={photo.storage_path}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full"
              >
                {/* next/image blocked for arbitrary hosts; use plain img */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.storage_path}
                  alt={photo.file_name}
                  className="w-full h-full object-cover"
                />
              </a>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-white/90 text-gray-600 hover:text-red-600 opacity-0 group-hover:opacity-100 transition shadow"
                  aria-label="Delete photo"
                >
                  <Trash2 size={14} />
                </button>
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
