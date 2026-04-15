"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import {
  Plus, ChevronDown, ChevronRight, Circle, CheckCircle2, Loader2,
  Calendar, MessageSquare, AlertCircle, Camera, Upload, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createProjectFieldLog,
  createProjectFieldTodo,
  updateProjectTodoStatus,
} from "@/app/(app)/projects/[id]/actions";
import { uploadFieldLogPhoto } from "@/app/(app)/field-logs/actions";

interface Todo {
  id: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
}

interface FieldLog {
  id: string;
  log_date: string;
  notes: string;
}

const PRIORITY_COLORS: Record<string, { ring: string; bg: string; text: string }> = {
  low:    { ring: "border-gray-300", bg: "bg-gray-50",  text: "text-gray-500" },
  normal: { ring: "border-blue-400", bg: "bg-blue-50",  text: "text-blue-600" },
  urgent: { ring: "border-red-400",  bg: "bg-red-50",   text: "text-red-600" },
};

const TODO_CYCLE: Record<string, string> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
};

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function NewLogForm({ projectId, onCreated, onCancel }: { projectId: string; onCreated: () => void; onCancel: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const today = new Date().toISOString().split("T")[0]!;

  useEffect(() => { textareaRef.current?.focus(); }, []);

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
    setPhotos((prev) => [...prev, ...accepted]);
  }

  function removePhoto(i: number) {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError("");
        startTransition(async () => {
          try {
            const log = await createProjectFieldLog(projectId, fd);
            for (const photo of photos) {
              const pfd = new FormData();
              pfd.append("file", photo);
              pfd.append("project_id", projectId);
              pfd.append("field_log_id", log.id);
              pfd.append("log_date", log.log_date);
              await uploadFieldLogPhoto(pfd);
            }
            (e.target as HTMLFormElement).reset();
            setPhotos([]);
            onCreated();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save log.");
          }
        });
      }}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
    >
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <MessageSquare size={14} className="text-[#4272EF]" />
          New Field Log
        </h3>
        <input
          name="log_date"
          type="date"
          defaultValue={today}
          required
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 bg-gray-50 w-auto"
        />
      </div>
      <div className="px-4 pb-3">
        <textarea
          ref={textareaRef}
          name="notes"
          placeholder="What happened on site today?"
          required
          rows={4}
          className="w-full border-0 bg-gray-50 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 resize-none placeholder:text-gray-400"
        />
      </div>

      {/* Photos */}
      <div className="px-4 pb-3 space-y-2">
        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((f, i) => {
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
                    className="absolute top-1 right-1 p-1 rounded-full bg-white/90 text-gray-600 active:text-red-600 shadow"
                    aria-label="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 active:bg-gray-100 cursor-pointer min-h-[40px]">
            <Camera size={14} />
            Take Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 active:bg-gray-100 cursor-pointer min-h-[40px]">
            <Upload size={14} />
            Upload
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
            />
          </label>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-sm text-gray-500 font-medium rounded-lg active:bg-gray-200 transition-colors min-h-[44px]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-semibold active:bg-[#3461de] transition-colors disabled:opacity-60 min-h-[44px]"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          Save Log
        </button>
      </div>
    </form>
  );
}

function AddTodoForm({ projectId, logId, onCreated }: { projectId: string; logId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[#4272EF] font-medium active:text-[#3461de] py-2 min-h-[44px]"
      >
        <Plus size={14} /> Add to-do
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await createProjectFieldTodo(projectId, logId, fd);
          setOpen(false);
          onCreated();
        });
      }}
      className="mt-2 space-y-2"
    >
      <input
        ref={inputRef}
        name="description"
        placeholder="What needs to be done?"
        required
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 min-h-[44px]"
      />
      <div className="flex items-center gap-2">
        <select name="priority" defaultValue="normal"
          className="border border-gray-200 rounded-lg px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 min-h-[44px]">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
        </select>
        <input name="due_date" type="date"
          className="border border-gray-200 rounded-lg px-2.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#4272EF]/30 min-h-[44px]" />
        <div className="flex-1" />
        <button type="button" onClick={() => setOpen(false)}
          className="px-3 py-2 text-xs text-gray-400 active:text-gray-600 min-h-[44px]">Cancel</button>
        <button type="submit" disabled={isPending}
          className="px-4 py-2 bg-[#4272EF] text-white rounded-lg text-xs font-semibold active:bg-[#3461de] transition-colors disabled:opacity-60 min-h-[44px]">
          {isPending ? <Loader2 size={12} className="animate-spin" /> : "Add"}
        </button>
      </div>
    </form>
  );
}

function TodoRow({ todo, projectId, onChange }: { todo: Todo; projectId: string; onChange: () => void }) {
  const [isPending, startTransition] = useTransition();

  function cycle() {
    const next = TODO_CYCLE[todo.status] ?? "open";
    startTransition(async () => {
      await updateProjectTodoStatus(projectId, todo.id, next);
      onChange();
    });
  }

  const done = todo.status === "done";
  const inProgress = todo.status === "in_progress";
  const colors = PRIORITY_COLORS[todo.priority] ?? PRIORITY_COLORS.normal;

  return (
    <button
      onClick={cycle}
      disabled={isPending}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all min-h-[48px] text-left ${
        done ? "opacity-60" : "active:bg-gray-50"
      } ${isPending ? "opacity-50" : ""}`}
      aria-label={`${todo.description} — ${todo.status}, tap to advance`}
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        done ? "bg-green-100" : inProgress ? "bg-[#4272EF]/10 border-2 border-[#4272EF]" : `border-2 ${colors.ring}`
      }`}>
        {done && <CheckCircle2 size={16} className="text-green-500" />}
        {inProgress && <div className="w-2 h-2 rounded-full bg-[#4272EF]" />}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${done ? "line-through text-gray-400" : "text-gray-800"}`}>
          {todo.description}
        </span>
        {todo.due_date && !done && (
          <span className="block text-xs text-gray-400 mt-0.5">Due {relativeDate(todo.due_date)}</span>
        )}
      </div>
      {!done && todo.priority === "urgent" && (
        <AlertCircle size={14} className="text-red-400 shrink-0" />
      )}
    </button>
  );
}

function LogCard({ log, todos, projectId, onRefresh }: {
  log: FieldLog; todos: Todo[]; projectId: string; onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const openCount = todos.filter((t) => t.status !== "done").length;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors min-h-[56px]"
      >
        <div className="flex-shrink-0 mt-0.5 text-gray-400">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={12} className="text-gray-400 shrink-0" />
            <span className="text-xs font-medium text-gray-500">{relativeDate(log.log_date)}</span>
            <span className="text-[10px] text-gray-300">{log.log_date}</span>
          </div>
          <p className="text-sm text-gray-800 line-clamp-2 leading-relaxed">{log.notes}</p>
        </div>
        {todos.length > 0 && (
          <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium mt-0.5 ${
            openCount > 0 ? "bg-amber-50 text-amber-600 border border-amber-200" : "bg-green-50 text-green-600 border border-green-200"
          }`}>
            {openCount > 0 ? `${openCount} open` : "done"}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-50">
          <p className="text-sm text-gray-700 my-3 whitespace-pre-wrap leading-relaxed">{log.notes}</p>
          {todos.length > 0 && (
            <div className="space-y-0.5 mb-1">
              {todos.map((t) => (
                <TodoRow key={t.id} todo={t} projectId={projectId} onChange={onRefresh} />
              ))}
            </div>
          )}
          <AddTodoForm projectId={projectId} logId={log.id} onCreated={onRefresh} />
        </div>
      )}
    </div>
  );
}

export default function FieldLogsTab({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<FieldLog[]>([]);
  const [todosByLog, setTodosByLog] = useState<Record<string, Todo[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const supabase = createClient();
    const [logsRes, todosRes] = await Promise.all([
      supabase.from("field_logs").select("id, log_date, notes").eq("project_id", projectId).order("log_date", { ascending: false }),
      supabase.from("field_todos").select("id, field_log_id, description, status, priority, due_date").eq("project_id", projectId),
    ]);

    const byLog: Record<string, Todo[]> = {};
    for (const t of todosRes.data ?? []) {
      if (!t.field_log_id) continue;
      if (!byLog[t.field_log_id]) byLog[t.field_log_id] = [];
      byLog[t.field_log_id]!.push(t);
    }

    setLogs(logsRes.data ?? []);
    setTodosByLog(byLog);
    setLoading(false);
  }

  useEffect(() => { load(); }, [projectId]);

  const totalOpenTodos = Object.values(todosByLog).flat().filter((t) => t.status !== "done").length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">
            {logs.length} log{logs.length !== 1 ? "s" : ""}
          </span>
          {totalOpenTodos > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-medium">
              {totalOpenTodos} open to-do{totalOpenTodos !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#4272EF] text-white rounded-lg text-sm font-semibold active:bg-[#3461de] transition-colors min-h-[44px] shadow-sm"
        >
          <Plus size={15} />
          New Log
        </button>
      </div>

      {showForm && (
        <NewLogForm
          projectId={projectId}
          onCreated={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {logs.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-gray-200 rounded-xl">
          <MessageSquare size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No field logs yet</p>
          <p className="text-xs text-gray-300 mt-1">{"Tap \"New Log\" to record your first site visit"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <LogCard
              key={log.id}
              log={log}
              todos={todosByLog[log.id] ?? []}
              projectId={projectId}
              onRefresh={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
