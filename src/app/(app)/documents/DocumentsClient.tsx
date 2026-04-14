"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  Upload,
  FileText,
  ExternalLink,
  FolderOpen,
  Building2,
  Users,
  Briefcase,
  ChevronRight,
  ArrowLeft,
  Search,
} from "lucide-react";
import { uploadDocument, deleteDocument } from "./actions";
import type { Database } from "@/types/database";

type Document = Database["public"]["Tables"]["documents"]["Row"];
type ProjectRef = { id: string; name: string; project_type: string | null; subdivision: string | null };
type VendorRef = { id: string; name: string; trade: string | null };

const PROJECT_FOLDERS = [
  "Construction Plans",
  "Field Photos",
  "Inspections/Permits",
  "Marketing",
  "Closing",
  "Sales",
  "Other",
] as const;

const FOLDER_COLORS: Record<string, string> = {
  "Construction Plans": "bg-blue-50 text-blue-700",
  "Field Photos": "bg-pink-50 text-pink-700",
  "Inspections/Permits": "bg-purple-50 text-purple-700",
  Marketing: "bg-amber-50 text-amber-700",
  Closing: "bg-emerald-50 text-emerald-700",
  Sales: "bg-indigo-50 text-indigo-700",
  Other: "bg-gray-100 text-gray-600",
};

type Category = "project" | "vendor" | "company";
type View =
  | { kind: "landing" }
  | { kind: "project-list" }
  | { kind: "vendor-list" }
  | { kind: "project-docs"; projectId: string }
  | { kind: "vendor-docs"; vendorId: string }
  | { kind: "company-docs" };

function fmtSize(kb: number | null) {
  if (!kb) return "";
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function UploadForm({
  projects,
  vendors,
  defaults,
  onDone,
}: {
  projects: ProjectRef[];
  vendors: VendorRef[];
  defaults?: { category?: Category; projectId?: string; vendorId?: string };
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<Category>(defaults?.category ?? "project");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // Force company-level: clear project/vendor
        if (category === "company") {
          fd.set("project_id", "");
          fd.set("vendor_id", "");
          fd.set("folder", "General");
        } else if (category === "project") {
          fd.set("vendor_id", "");
        } else if (category === "vendor") {
          fd.set("project_id", "");
          fd.set("folder", "General");
        }
        startTransition(async () => {
          await uploadDocument(fd);
          onDone();
        });
      }}
      className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4"
    >
      <h3 className="font-semibold text-gray-900">Upload Document</h3>

      <div className="flex gap-2">
        {(["project", "vendor", "company"] as Category[]).map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 text-xs rounded-lg border capitalize ${
              category === c
                ? "bg-[#4272EF] text-white border-[#4272EF]"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {category === "project" && (
          <select
            name="project_id"
            required
            defaultValue={defaults?.projectId ?? ""}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="">Select project *</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {category === "vendor" && (
          <select
            name="vendor_id"
            required
            defaultValue={defaults?.vendorId ?? ""}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="">Select vendor *</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        {category === "project" && (
          <select
            name="folder"
            required
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="">Select folder *</option>
            {PROJECT_FOLDERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
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
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
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

function DocTable({
  docs,
  resolveContext,
  onDelete,
  showFolder = true,
}: {
  docs: Document[];
  resolveContext: (d: Document) => string;
  onDelete: (id: string, path: string | null, name: string) => void;
  showFolder?: boolean;
}) {
  if (docs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center">
        <FolderOpen size={32} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No documents here yet.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">File</th>
            {showFolder && (
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Folder</th>
            )}
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Context</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Size</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {docs.map((doc) => (
            <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-gray-400 shrink-0" />
                  <span className="text-gray-900 font-medium">{doc.file_name}</span>
                </div>
                {doc.notes && <p className="text-xs text-gray-400 mt-0.5 ml-5">{doc.notes}</p>}
              </td>
              {showFolder && (
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${FOLDER_COLORS[doc.folder] ?? "bg-gray-100 text-gray-600"}`}>
                    {doc.folder}
                  </span>
                </td>
              )}
              <td className="px-4 py-3 text-gray-500 text-xs">{resolveContext(doc)}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">{fmtSize(doc.file_size_kb)}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">
                {new Date(doc.created_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
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
                    onClick={() => onDelete(doc.id, doc.storage_path, doc.file_name)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocumentsClient({
  documents,
  projects,
  vendors,
}: {
  documents: Document[];
  projects: ProjectRef[];
  vendors: VendorRef[];
}) {
  const [view, setView] = useState<View>({ kind: "landing" });
  const [showUpload, setShowUpload] = useState(false);
  const [folderFilter, setFolderFilter] = useState("");
  const [search, setSearch] = useState("");
  const [, startTransition] = useTransition();

  // Counts per category
  const projectDocCount = useMemo(
    () => documents.filter((d) => d.project_id).length,
    [documents],
  );
  const vendorDocCount = useMemo(
    () => documents.filter((d) => d.vendor_id).length,
    [documents],
  );
  const companyDocCount = useMemo(
    () => documents.filter((d) => !d.project_id && !d.vendor_id).length,
    [documents],
  );

  const docCountByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of documents) if (d.project_id) m.set(d.project_id, (m.get(d.project_id) ?? 0) + 1);
    return m;
  }, [documents]);

  const docCountByVendor = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of documents) if (d.vendor_id) m.set(d.vendor_id, (m.get(d.vendor_id) ?? 0) + 1);
    return m;
  }, [documents]);

  const totalSizeMb = documents.reduce((s, d) => s + (d.file_size_kb ?? 0), 0) / 1024;

  const handleDelete = (id: string, path: string | null, name: string) => {
    startTransition(async () => {
      if (confirm(`Delete "${name}"?`)) await deleteDocument(id, path);
    });
  };

  const resolveContext = (d: Document) => {
    if (d.project_id) return projects.find((p) => p.id === d.project_id)?.name ?? "Project";
    if (d.vendor_id) return vendors.find((v) => v.id === d.vendor_id)?.name ?? "Vendor";
    return "Company";
  };

  const filteredDocs = (docs: Document[]) => {
    return docs.filter((d) => {
      const fMatch = !folderFilter || d.folder === folderFilter;
      const sMatch =
        !search ||
        d.file_name.toLowerCase().includes(search.toLowerCase()) ||
        (d.notes ?? "").toLowerCase().includes(search.toLowerCase());
      return fMatch && sMatch;
    });
  };

  // --- Breadcrumb ---
  const Breadcrumb = () => {
    const crumbs: { label: string; onClick?: () => void }[] = [
      { label: "Documents", onClick: () => setView({ kind: "landing" }) },
    ];
    if (view.kind === "project-list" || view.kind === "project-docs") {
      crumbs.push({ label: "Projects", onClick: () => setView({ kind: "project-list" }) });
    }
    if (view.kind === "vendor-list" || view.kind === "vendor-docs") {
      crumbs.push({ label: "Vendors", onClick: () => setView({ kind: "vendor-list" }) });
    }
    if (view.kind === "company-docs") {
      crumbs.push({ label: "Company" });
    }
    if (view.kind === "project-docs") {
      const p = projects.find((x) => x.id === view.projectId);
      crumbs.push({ label: p?.name ?? "Project" });
    }
    if (view.kind === "vendor-docs") {
      const v = vendors.find((x) => x.id === view.vendorId);
      crumbs.push({ label: v?.name ?? "Vendor" });
    }
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
            {c.onClick && i < crumbs.length - 1 ? (
              <button onClick={c.onClick} className="hover:text-[#4272EF]">
                {c.label}
              </button>
            ) : (
              <span className={i === crumbs.length - 1 ? "text-gray-900 font-medium" : ""}>{c.label}</span>
            )}
          </span>
        ))}
      </div>
    );
  };

  const BackButton = () =>
    view.kind !== "landing" ? (
      <button
        onClick={() => {
          if (view.kind === "project-docs") setView({ kind: "project-list" });
          else if (view.kind === "vendor-docs") setView({ kind: "vendor-list" });
          else setView({ kind: "landing" });
        }}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#4272EF]"
      >
        <ArrowLeft size={14} /> Back
      </button>
    ) : null;

  // --- Landing page ---
  if (view.kind === "landing") {
    return (
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <Breadcrumb />
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
            style={{ backgroundColor: "#4272EF" }}
          >
            <Plus size={15} /> Upload Document
          </button>
        </div>

        {showUpload && (
          <UploadForm projects={projects} vendors={vendors} onDone={() => setShowUpload(false)} />
        )}

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total Documents</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{documents.length}</p>
          </div>
          <div
            className={`rounded-xl border p-4 ${
              totalSizeMb > 450 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"
            }`}
          >
            <p className={`text-xs ${totalSizeMb > 450 ? "text-amber-700" : "text-gray-500"}`}>Storage Used</p>
            <p className={`text-2xl font-bold mt-1 ${totalSizeMb > 450 ? "text-amber-700" : "text-gray-900"}`}>
              {totalSizeMb.toFixed(0)} MB
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Uploaded This Month</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {
                documents.filter((d) => {
                  const dt = new Date(d.created_at);
                  const now = new Date();
                  return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
                }).length
              }
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => setView({ kind: "project-list" })}
            className="group bg-white rounded-xl border border-gray-200 p-6 text-left hover:border-[#4272EF] hover:shadow-sm transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-blue-50 text-[#4272EF] flex items-center justify-center mb-4 group-hover:bg-[#4272EF] group-hover:text-white transition-colors">
              <Briefcase size={22} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Project</h3>
            <p className="text-sm text-gray-500 mt-1">
              Plans, permits, inspections, and contracts tied to a specific job.
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {projectDocCount} {projectDocCount === 1 ? "document" : "documents"} ·{" "}
                {docCountByProject.size} {docCountByProject.size === 1 ? "project" : "projects"}
              </span>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-[#4272EF]" />
            </div>
          </button>

          <button
            onClick={() => setView({ kind: "vendor-list" })}
            className="group bg-white rounded-xl border border-gray-200 p-6 text-left hover:border-[#4272EF] hover:shadow-sm transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Users size={22} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Vendor</h3>
            <p className="text-sm text-gray-500 mt-1">
              Certificates of insurance, licenses, W-9s, and vendor agreements.
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {vendorDocCount} {vendorDocCount === 1 ? "document" : "documents"} ·{" "}
                {docCountByVendor.size} {docCountByVendor.size === 1 ? "vendor" : "vendors"}
              </span>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-[#4272EF]" />
            </div>
          </button>

          <button
            onClick={() => setView({ kind: "company-docs" })}
            className="group bg-white rounded-xl border border-gray-200 p-6 text-left hover:border-[#4272EF] hover:shadow-sm transition-all"
          >
            <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Building2 size={22} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Company</h3>
            <p className="text-sm text-gray-500 mt-1">
              Corporate records, tax filings, insurance, and other company-level files.
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {companyDocCount} {companyDocCount === 1 ? "document" : "documents"}
              </span>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-[#4272EF]" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  // --- Project list ---
  if (view.kind === "project-list") {
    const list = [...projects].sort(
      (a, b) => (docCountByProject.get(b.id) ?? 0) - (docCountByProject.get(a.id) ?? 0),
    );
    const filtered = list.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
    return (
      <div className="space-y-5 max-w-5xl">
        <div className="flex items-center justify-between">
          <Breadcrumb />
          <BackButton />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            />
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
            style={{ backgroundColor: "#4272EF" }}
          >
            <Plus size={15} /> Upload
          </button>
        </div>
        {showUpload && (
          <UploadForm
            projects={projects}
            vendors={vendors}
            defaults={{ category: "project" }}
            onDone={() => setShowUpload(false)}
          />
        )}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">No projects found.</div>
          )}
          {filtered.map((p) => {
            const count = docCountByProject.get(p.id) ?? 0;
            return (
              <button
                key={p.id}
                onClick={() => setView({ kind: "project-docs", projectId: p.id })}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.subdivision ? `${p.subdivision} · ` : ""}
                    {p.project_type === "home_construction"
                      ? "Home Construction"
                      : p.project_type === "land_development"
                      ? "Land Development"
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {count} {count === 1 ? "doc" : "docs"}
                  </span>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Vendor list ---
  if (view.kind === "vendor-list") {
    const list = [...vendors].sort(
      (a, b) => (docCountByVendor.get(b.id) ?? 0) - (docCountByVendor.get(a.id) ?? 0),
    );
    const filtered = list.filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()));
    return (
      <div className="space-y-5 max-w-5xl">
        <div className="flex items-center justify-between">
          <Breadcrumb />
          <BackButton />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            />
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
            style={{ backgroundColor: "#4272EF" }}
          >
            <Plus size={15} /> Upload
          </button>
        </div>
        {showUpload && (
          <UploadForm
            projects={projects}
            vendors={vendors}
            defaults={{ category: "vendor" }}
            onDone={() => setShowUpload(false)}
          />
        )}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">No vendors found.</div>
          )}
          {filtered.map((v) => {
            const count = docCountByVendor.get(v.id) ?? 0;
            return (
              <button
                key={v.id}
                onClick={() => setView({ kind: "vendor-docs", vendorId: v.id })}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{v.name}</p>
                  {v.trade && <p className="text-xs text-gray-400 mt-0.5">{v.trade}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {count} {count === 1 ? "doc" : "docs"}
                  </span>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Document listing views (project-docs / vendor-docs / company-docs) ---
  let docs: Document[] = [];
  let uploadDefaults: { category: Category; projectId?: string; vendorId?: string } = { category: "company" };
  if (view.kind === "project-docs") {
    docs = documents.filter((d) => d.project_id === view.projectId);
    uploadDefaults = { category: "project", projectId: view.projectId };
  } else if (view.kind === "vendor-docs") {
    docs = documents.filter((d) => d.vendor_id === view.vendorId);
    uploadDefaults = { category: "vendor", vendorId: view.vendorId };
  } else if (view.kind === "company-docs") {
    docs = documents.filter((d) => !d.project_id && !d.vendor_id);
    uploadDefaults = { category: "company" };
  }

  const visible = filteredDocs(docs);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <Breadcrumb />
        <BackButton />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>
        {view.kind === "project-docs" && (
          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="">All folders</option>
            {PROJECT_FOLDERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setShowUpload(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
          style={{ backgroundColor: "#4272EF" }}
        >
          <Plus size={15} /> Upload
        </button>
      </div>

      {showUpload && (
        <UploadForm
          projects={projects}
          vendors={vendors}
          defaults={uploadDefaults}
          onDone={() => setShowUpload(false)}
        />
      )}

      <DocTable
        docs={visible}
        resolveContext={resolveContext}
        onDelete={handleDelete}
        showFolder={view.kind === "project-docs"}
      />
    </div>
  );
}
