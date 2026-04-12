"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AddTodoForm({
  projectId,
  logId,
  userId,
}: {
  projectId: string;
  logId: string;
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "urgent">("normal");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) { setError("Description is required."); return; }
    setSaving(true);
    setError("");

    const { error: err } = await supabase.from("field_todos").insert({
      project_id: projectId,
      field_log_id: logId,
      description: description.trim(),
      priority,
      due_date: dueDate || null,
      created_by: userId,
    });

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

    router.push(`/projects/${projectId}/field-logs/${logId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="font-semibold text-gray-900">New To-Do</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What needs to be done?"
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as "low" | "normal" | "urgent")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="bg-[#4272EF] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add To-Do"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
