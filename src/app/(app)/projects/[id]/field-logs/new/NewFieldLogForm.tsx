"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Camera, Upload, X } from "lucide-react";
import { uploadFieldLogPhoto } from "@/app/actions/field-logs";
import StatusBadge, { type StatusKind } from "@/components/ui/StatusBadge";

interface Todo {
  description: string;
  priority: "low" | "normal" | "urgent";
  due_date: string;
}

const priorityKinds: Record<Todo["priority"], StatusKind> = {
  low: "neutral",
  normal: "active",
  urgent: "over",
};

export default function NewFieldLogForm({ projectId, userId }: { projectId: string; userId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const today = new Date().toISOString().split("T")[0];

  const [logDate, setLogDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [newTodoDesc, setNewTodoDesc] = useState("");
  const [newTodoPriority, setNewTodoPriority] = useState<"low" | "normal" | "urgent">("normal");
  const [newTodoDue, setNewTodoDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function addTodo() {
    if (!newTodoDesc.trim()) return;
    setTodos((prev) => [...prev, { description: newTodoDesc.trim(), priority: newTodoPriority, due_date: newTodoDue }]);
    setNewTodoDesc("");
    setNewTodoPriority("normal");
    setNewTodoDue("");
  }

  function removeTodo(i: number) {
    setTodos((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const accepted: File[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 25 * 1024 * 1024) {
        setError(`${f.name} is larger than 25MB.`);
        continue;
      }
      accepted.push(f);
    }
    setPendingPhotos((prev) => [...prev, ...accepted]);
  }

  function removePhoto(i: number) {
    setPendingPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim()) { setError("Notes are required."); return; }
    setSaving(true);
    setError("");

    const { data: log, error: logErr } = await supabase
      .from("field_logs")
      .insert({ project_id: projectId, log_date: logDate, notes: notes.trim(), created_by: userId })
      .select("id")
      .single();

    if (logErr || !log) {
      setError(logErr?.message ?? "Failed to save log.");
      setSaving(false);
      return;
    }

    if (todos.length > 0) {
      const todoRows = todos.map((t) => ({
        project_id: projectId,
        field_log_id: log.id,
        description: t.description,
        priority: t.priority,
        due_date: t.due_date || null,
        created_by: userId,
      }));
      const { error: todoErr } = await supabase.from("field_todos").insert(todoRows);
      if (todoErr) {
        setError(todoErr.message);
        setSaving(false);
        return;
      }
    }

    // Upload queued photos (sequential — most job-site uploads are cellular).
    for (const photo of pendingPhotos) {
      const fd = new FormData();
      fd.append("file", photo);
      fd.append("project_id", projectId);
      fd.append("field_log_id", log.id);
      fd.append("log_date", logDate);
      try {
        await uploadFieldLogPhoto(fd);
      } catch (e) {
        setError(
          `Log saved, but photo "${photo.name}" failed: ${
            e instanceof Error ? e.message : "upload error"
          }. You can add it from the log detail page.`,
        );
        setSaving(false);
        router.push(`/projects/${projectId}/field-logs/${log.id}`);
        return;
      }
    }

    router.push(`/projects/${projectId}/field-logs/${log.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Log card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Log Details</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={logDate}
            onChange={(e) => setLogDate(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Field Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe work performed, observations, weather, site conditions, issues noticed…"
            rows={6}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none"
          />
        </div>
      </div>

      {/* Photos */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">
          Photos <span className="text-gray-400 font-normal text-sm">(optional)</span>
        </h2>

        {pendingPhotos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {pendingPhotos.map((f, i) => {
              const url = URL.createObjectURL(f);
              return (
                <div
                  key={`${f.name}-${i}`}
                  className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={f.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-white/90 text-gray-600 hover:text-red-600 shadow"
                    aria-label="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

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
                addPhotos(e.target.files);
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
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="text-xs text-gray-400">
          Photos are saved to Documents → Field Photos with this log&apos;s date.
        </p>
      </div>

      {/* To-dos */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">To-Dos <span className="text-gray-400 font-normal text-sm">(optional)</span></h2>

        {todos.length > 0 && (
          <ul className="space-y-2">
            {todos.map((t, i) => (
              <li key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                <StatusBadge status={priorityKinds[t.priority]} size="sm">
                  {t.priority}
                </StatusBadge>
                <span className="flex-1 text-sm text-gray-800">{t.description}</span>
                {t.due_date && <span className="text-xs text-gray-400">Due {t.due_date}</span>}
                <button type="button" onClick={() => removeTodo(i)} className="text-gray-300 hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add to-do row */}
        <div className="space-y-2">
          <input
            type="text"
            value={newTodoDesc}
            onChange={(e) => setNewTodoDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTodo(); } }}
            placeholder="Describe a to-do item…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
          <div className="flex gap-2">
            <select
              value={newTodoPriority}
              onChange={(e) => setNewTodoPriority(e.target.value as "low" | "normal" | "urgent")}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              type="date"
              value={newTodoDue}
              onChange={(e) => setNewTodoDue(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
            />
            <button
              type="button"
              onClick={addTodo}
              disabled={!newTodoDesc.trim()}
              className="inline-flex items-center gap-1.5 border border-gray-300 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-[#4272EF] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Log"}
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
