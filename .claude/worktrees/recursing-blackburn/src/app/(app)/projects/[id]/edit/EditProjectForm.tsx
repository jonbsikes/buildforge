"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProject, deleteProject } from "../../actions";
import type { Database } from "@/types/database";

type Project = Database["public"]["Tables"]["projects"]["Row"];

export default function EditProjectForm({ project }: { project: Project }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      try {
        await updateProject(project.id, fd);
        router.push(`/projects/${project.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update project");
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${project.name}"? This cannot be undone and will remove all stages, cost items, and milestones.`)) return;
    setIsDeleting(true);
    startTransition(async () => {
      try {
        await deleteProject(project.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete project");
        setIsDeleting(false);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Edit Project</h2>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Project Name <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          required
          defaultValue={project.name}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Type</label>
          <select
            name="project_type"
            defaultValue={project.project_type}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="home_construction">Home Construction</option>
            <option value="land_development">Land Development</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            name="status"
            defaultValue={project.status}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <input
          name="address"
          defaultValue={project.address ?? ""}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Total Budget ($)</label>
        <input
          name="total_budget"
          type="number"
          min="0"
          step="1000"
          defaultValue={project.total_budget}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            name="start_date"
            type="date"
            defaultValue={project.start_date ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <input
            name="end_date"
            type="date"
            defaultValue={project.end_date ?? ""}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={project.description ?? ""}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending || isDeleting}
          className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          {isDeleting ? "Deleting..." : "Delete Project"}
        </button>
        <div className="flex gap-3">
          <a
            href={`/projects/${project.id}`}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
