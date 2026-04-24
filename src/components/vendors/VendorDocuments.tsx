"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, FileText, Trash2, ExternalLink, Loader2 } from "lucide-react";
import ConfirmButton from "@/components/ui/ConfirmButton";
import MetadataChip from "@/components/ui/MetadataChip";

const FOLDER_OPTIONS = ["W9", "COI", "License", "Contract", "Other"] as const;
type Folder = typeof FOLDER_OPTIONS[number];

export interface VendorDocument {
  id: string;
  folder: string;
  file_name: string;
  storage_path: string;
  file_size_kb: number | null;
  mime_type: string | null;
  notes: string | null;
  created_at: string;
}

interface Props {
  vendorId: string;
  initialDocs: VendorDocument[];
}

function fmtSize(kb: number | null) {
  if (!kb) return "";
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}


export default function VendorDocuments({ vendorId, initialDocs }: Props) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<VendorDocument[]>(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<Folder>("W9");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `vendor-docs/${vendorId}/${Date.now()}-${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: doc, error: insertErr } = await supabase
        .from("documents")
        .insert({
          vendor_id: vendorId,
          project_id: null,
          folder: selectedFolder,
          file_name: file.name,
          storage_path: storagePath,
          file_size_kb: Math.round(file.size / 1024),
          mime_type: file.type,
          uploaded_by: user.id,
        })
        .select("id, folder, file_name, storage_path, file_size_kb, mime_type, notes, created_at")
        .single();

      if (insertErr || !doc) throw new Error(insertErr?.message ?? "DB error");
      setDocs((prev) => [doc, ...prev]);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleOpen(doc: VendorDocument) {
    setOpeningId(doc.id);
    try {
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDelete(doc: VendorDocument) {
    setDeletingId(doc.id);
    try {
      await supabase.storage.from("documents").remove([doc.storage_path]);
      await supabase.from("documents").delete().eq("id", doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Documents</h3>

      {/* Upload row */}
      <div className="flex items-center gap-3">
        <select
          value={selectedFolder}
          onChange={(e) => setSelectedFolder(e.target.value as Folder)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          {FOLDER_OPTIONS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {uploading
            ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
            : <><Upload size={14} /> Upload File</>}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
        />

        {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No documents uploaded yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 py-2.5">
              <FileText size={16} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{doc.file_name}</p>
                <p className="text-xs text-gray-400">
                  {fmtDate(doc.created_at)}{doc.file_size_kb ? ` · ${fmtSize(doc.file_size_kb)}` : ""}
                </p>
              </div>
              <MetadataChip className="flex-shrink-0">{doc.folder}</MetadataChip>
              <button
                type="button"
                onClick={() => handleOpen(doc)}
                disabled={openingId === doc.id}
                className="text-gray-400 hover:text-[#4272EF] transition-colors disabled:opacity-50"
                title="Open"
              >
                {openingId === doc.id ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
              </button>
              <ConfirmButton
                trigger={deletingId === doc.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                title={`Delete "${doc.file_name}"?`}
                body="This permanently removes the document."
                confirmLabel="Delete"
                tone="danger"
                onConfirm={async () => {
                  await handleDelete(doc);
                }}
                triggerClassName="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                ariaLabel={`Delete ${doc.file_name}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
