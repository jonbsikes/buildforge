"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Database } from "@/types/database";

type Stage = Pick<Database["public"]["Tables"]["stages"]["Row"], "id" | "name">;

export default function NewMilestoneForm({ stages }: { stages: Stage[] }) {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    stage_id: "",
    due_date: "",
    is_completed: false,
    completed_date: "",
    notes: "",
  });

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const { error } = await supabase.from("milestones").insert({
      project_id: projectId,
      stage_id: form.stage_id || null,
      name: form.name,
      due_date: form.due_date || null,
      is_completed: form.is_completed,
      completed_date: form.is_completed ? (form.completed_date || null) : null,
      notes: form.notes || null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
    } else {
      router.push(`/projects/${projectId}?tab=schedule`);
      router.refresh();
    }
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto">
        <Link href={`/projects/${projectId}?tab=schedule`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={15} /> Back to Project
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Add Milestone</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Milestone Name <span className="text-red-500">*</span></label>
              <input type="text" required value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Frame inspection passed, Council approval received"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stage (optional)</label>
                <select value={form.stage_id} onChange={(e) => set("stage_id", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">No stage</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.is_completed} onChange={(e) => set("is_completed", e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-medium text-gray-700">Already completed</span>
              </label>
              {form.is_completed && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Completion Date</label>
                  <input type="date" value={form.completed_date} onChange={(e) => set("completed_date", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving..." : "Add Milestone"}
              </button>
              <Link href={`/projects/${projectId}?tab=schedule`}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
