"use client";

import { useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import NewProjectModal from "./NewProjectModal";
import type { Database } from "@/types/database";

type Project = Database["public"]["Tables"]["projects"]["Row"];

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-600",
  active: "bg-green-50 text-green-700",
  on_hold: "bg-amber-50 text-amber-700",
  completed: "bg-blue-50 text-blue-700",
  cancelled: "bg-red-50 text-red-600",
};

const TYPE_LABELS: Record<string, string> = {
  home_construction: "Home Construction",
  land_development: "Land Development",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ProjectsClient({ projects }: { projects: Project[] }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {showModal && <NewProjectModal onClose={() => setShowModal(false)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-0.5">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-lg"
          style={{ backgroundColor: "#4272EF" }}
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <FolderOpen size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No projects yet</p>
          <p className="text-sm text-gray-500 mt-1 mb-4">Create your first project to get started.</p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-lg"
            style={{ backgroundColor: "#4272EF" }}
          >
            <Plus size={16} />
            New Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <a
              key={project.id}
              href={`/projects/${project.id}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-[#4272EF]/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate group-hover:text-[#4272EF] transition-colors">
                    {project.name}
                  </h2>
                  {project.address && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{project.address}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {project.status.replace("_", " ")}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-400">{TYPE_LABELS[project.project_type] ?? project.project_type}</span>
                {project.subdivision && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{project.subdivision}</span>
                )}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Budget</span>
                <span className="font-medium text-gray-900">{formatCurrency(project.total_budget)}</span>
              </div>

              {(project.start_date || project.end_date) && (
                <div className="flex items-center justify-between text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">
                  <span>{project.start_date ?? "—"}</span>
                  <span>→</span>
                  <span>{project.end_date ?? "—"}</span>
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </>
  );
}
