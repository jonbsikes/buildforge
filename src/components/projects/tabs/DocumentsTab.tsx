"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload, FileText, Image, File, Trash2, ExternalLink,
  FolderOpen, AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveDocument, deleteDocument } from "@/app/actions/projects";
import ConfirmButton from "@/components/ui/ConfirmButton";
import type { Document } from "@/components/projects/ProjectTabs";

const FOLDERS = [
  "Construction Plans",
  "Field Photos",
  "Inspections/Permits",
  "Marketing",
  "Closing",
  "Sales",
  "Other",
] as const;
type Folder = (typeof FOLDERS)[number];

const MAX_FILE_SIZE_KB = 25 * 1024; // 25 MB
const PROJECT_WARN_KB = 500 * 1024; // 500 MB

function fileIcon(mime: string | null) {
  if (!mime) return <File size={14} className="text-gray-400" />;
  if (mime.startsWith("image/")) return <Image size={14} className="text-blue-400" />;
  if (mime === "application/pdf") return <FileText size={14} className="text-red-400" />;
  return <File size={14} className="text-gray-400" />;
}

function fmtSize(kb: number | null) {
  if (kb == null) return "";
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Drop zone for a single folder
// ---------------------------------------------------------------------------
function FolderDropZone({
  folder,
  files,
  projectId,
  onUploaded,
  onDeleted,
}: {
  folder: Folder;
  files: Document[];
  projectId: string;
  onUploaded: (doc: Document) => void;
  onDeleted: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function uploadFile(file: File) {
    setWarning(null);

    if (file.size > MAX_FILE_SIZE_KB * 1024) {
      setWarning(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — over the 25 MB limit.`);
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setWarning("Not authenticated"); return; }

      // Path: {user_id}/{project_id}/{folder}/{timestamp}_{filename}
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${projectId}/${folder}/${Date.now()}_${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadErr) { setWarning(uploadErr.message); return; }

      const fileSizeKb = Math.round(file.size / 1024);
      const result = await saveDocument({
        projectId,
        folder,
        fileName: file.name,
        storagePath: path,
        fileSizeKb,
        mimeType: file.type,
      });

      if (result.error) { setWarning(result.error); return; }

      onUploaded({
        id: result.id!,
        folder,
        file_name: file.name,
        storage_path: path,
        file_size_kb: fileSizeKb,
        mime_type: file.type,
        created_at: new Date().toISOString(),
      });
    } finally {
      setUploading(false);
    }
  }

  async function handlePreview(doc: Document) {
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 3600);
    if (error || !data) { setWarning("Could not generate preview link."); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(doc: Document) {
    const result = await deleteDocument(doc.id, doc.storage_path, projectId);
    if (result.error) {
      setWarning(result.error);
      return { error: result.error };
    }
    onDeleted(doc.id);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach(uploadFile);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? []);
    selectedFiles.forEach(uploadFile);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Folder header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <FolderOpen size={15} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700">{folder}</span>
          {files.length > 0 && (
            <span className="text-xs text-gray-400">({files.length})</span>
          )}
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs text-[#4272EF] font-medium hover:text-[#3461de] transition-colors disabled:opacity-50"
        >
          <Upload size={12} />
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {/* Warning */}
      {warning && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
          {warning}
        </div>
      )}

      {/* Drop zone + file list */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`min-h-16 transition-colors ${dragging ? "bg-[#4272EF]/5 border-[#4272EF]/30" : ""}`}
      >
        {files.length === 0 && !uploading ? (
          <div
            className="flex flex-col items-center justify-center py-6 text-center cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={18} className="text-gray-300 mb-1.5" />
            <p className="text-xs text-gray-400">Drop files here or click to upload</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {files.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group">
                <div className="flex-shrink-0">{fileIcon(doc.mime_type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{doc.file_name}</p>
                  <p className="text-xs text-gray-400">{fmtSize(doc.file_size_kb)}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handlePreview(doc)}
                    className="p-1.5 rounded text-gray-400 hover:text-[#4272EF] hover:bg-blue-50 transition-colors"
                    title="Preview / Open"
                  >
                    <ExternalLink size={13} />
                  </button>
                  <ConfirmButton
                    trigger={<Trash2 size={13} />}
                    ariaLabel={`Delete ${doc.file_name}`}
                    triggerClassName="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete document?"
                    body={<p>Permanently delete &ldquo;{doc.file_name}&rdquo;? This cannot be undone.</p>}
                    confirmLabel="Delete"
                    onConfirm={() => handleDelete(doc)}
                  />
                </div>
              </div>
            ))}
            {uploading && (
              <div className="px-4 py-2.5 text-xs text-gray-400 animate-pulse">Uploading…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------
export default function DocumentsTab({
  projectId,
  initialDocuments,
}: {
  projectId: string;
  initialDocuments: Document[];
}) {
  const [docs, setDocs] = useState<Document[]>(initialDocuments);

  const totalKb = docs.reduce((s, d) => s + (d.file_size_kb ?? 0), 0);
  const nearLimit = totalKb >= PROJECT_WARN_KB * 0.9;
  const overLimit = totalKb >= PROJECT_WARN_KB;

  const handleUploaded = useCallback((doc: Document) => {
    setDocs((prev) => [doc, ...prev]);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const fmtTotalSize = (kb: number) => {
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(0)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Storage usage */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">
          Storage used: <span className={`font-medium ${overLimit ? "text-red-600" : nearLimit ? "text-amber-600" : "text-gray-700"}`}>
            {fmtTotalSize(totalKb)} / 500 MB
          </span>
        </span>
        {overLimit && (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <AlertTriangle size={12} /> Project storage limit reached (500 MB)
          </span>
        )}
        {nearLimit && !overLimit && (
          <span className="flex items-center gap-1 text-amber-600 font-medium">
            <AlertTriangle size={12} /> Approaching 500 MB limit
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{
            width: `${Math.min((totalKb / PROJECT_WARN_KB) * 100, 100)}%`,
            backgroundColor: overLimit
              ? "var(--status-over)"
              : nearLimit
                ? "var(--status-warning)"
                : "var(--brand-blue)",
          }}
        />
      </div>

      {/* Folder grid */}
      <div className="grid grid-cols-1 gap-4">
        {FOLDERS.map((folder) => (
          <FolderDropZone
            key={folder}
            folder={folder}
            files={docs.filter((d) => d.folder === folder)}
            projectId={projectId}
            onUploaded={handleUploaded}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
    </div>
  );
}
