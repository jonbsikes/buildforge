"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, BookOpen, Upload, FileText, ExternalLink } from "lucide-react";
import { uploadDocument, deleteDocument } from "./actions";
import type { Database } from "@/types/database";

type Document = Database["public"]["Tables"]["documents"]["Row"];
type ProjectRef = { id: string; name: string };

const FOLDERS = ["Plans", "Permits", "Contracts", "Lender", "Inspections", "Photos", "Other"] as const;

const FOLDER_COLORS: Record<string, string> = {
  Plans: "bg-blue-50 text-blue-700",
  Permits: "bg-purple-50 text-purple-700",
  Contracts: "bg-indigo-50 text-indigo-700",
  Lender: "bg-green-50 text-green-700",
  Inspections: "bg-amber-50 text-amber-700",
  Photos: "bg-pink-50 text-pink-700",
  Other: "bg-gray-100 text-gray-600",
};

function fmtSize(kb: number | null) {
  if (!kb) return "";
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function UploadForm({ projects, onDone }: { projects: ProjectRef[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await uploadDocument(fd);
          onDone();
        });
      }}
      className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4"
    >
      <h3 className="font-semibold text-gray-900">Upload Document</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          name="project_id"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">Company-level (no project)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          name="folder"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">Select folder *</option>
          {FOLDERS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">File *</label>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4272EF] file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700"
          />
          {file && file.size > 25 * 1024 * 1024 && (
            <p className="text-xs text-amber-600 mt-1">Warning: file is larger than 25 MB.</p>
          )}
        </div>
        <textarea
          name="notes"
          placeholder="Notes (optional)"
          rows={2}
          className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none"
        />
      </div>
      <p className="text-xs text-gray-400 italic">
        Storage discipline: plans, permits, contracts, lender docs, inspection reports only. No design photos or duplicate PDFs.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "#4272EF" }}
        >
          <Upload size={14} />
          {isPending ? "Uploading..." : "Upload"}
        </button>
      </div>
    </form>
  );
}

export default function DocumentsClient({
  documents,
  projects,
}: {
  documents: Document[];
  projects: ProjectRef[];
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [filterProject, setFilterProject] = useState("");
  const [filterFolder, setFilterFolder] = useState("");
  const [, startTransition] = useTransition();

  const filtered = documents.filter((d) => {
    const matchProject = !filterProject || d.project_id === filterProject;
    const matchFolder = !filterFolder || d.folder === filterFolder;
    return matchProject && matchFolder;
  });

  const totalSizeKb = documents.reduce((s, d) => s + (d.file_size_kb ?? 0), 0);
  const totalSizeMb = totalSizeKb / 1024;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Documents</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{documents.length}</p>
        </div>
        <div className={`rounded-xl border p-4 ${totalSizeMb > 450 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
          <p className={`text-xs ${totalSizeMb > 450 ? "text-amber-700" : "text-gray-500"}`}>Storage Used</p>
          <p className={`text-2xl font-bold mt-1 ${totalSizeMb > 450 ? "text-amber-700" : "text-gray-900"}`}>
            {totalSizeMb.toFixed(0)} MB
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Projects with Docs</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {new Set(documents.map((d) => d.project_id).filter(Boolean)).size}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">All projects</option>
          <option value="__company">Company-level</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={filterFolder}
          onChange={(e) => setFilterFolder(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">All folders</option>
          {FOLDERS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <button
          onClick={() => setShowUpload(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
          style={{ backgroundColor: "#4272EF" }}
        >
          <Plus size={15} /> Upload Document
        </button>
      </div>

      {showUpload && <UploadForm projects={projects} onDone={() => setShowUpload(false)} />}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center">
          <BookOpen size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No documents found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">File</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Folder</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Size</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((doc) => {
                const projectName = projects.find((p) => p.id === doc.project_id)?.name ?? (doc.project_id ? "" : "Company");
                return (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={15} className="text-gray-400 shrink-0" />
                        <span className="text-gray-900 font-medium">{doc.file_name}</span>
                      </div>
                      {doc.notes && <p className="text-xs text-gray-400 mt-0.5 ml-5">{doc.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${FOLDER_COLORS[doc.folder] ?? "bg-gray-100 text-gray-600"}`}>
                        {doc.folder}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{projectName}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtSize(doc.file_size_kb)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(doc.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {doc.storage_path && (
                          <a
                            href={doc.storage_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <button
                          onClick={() =>
                            startTransition(async () => {
                              if (confirm(`Delete "${doc.file_name}"?`)) await deleteDocument(doc.id, doc.storage_path);
                            })
                          }
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
