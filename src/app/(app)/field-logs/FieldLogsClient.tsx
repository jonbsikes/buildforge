"use client";

import { useState, useTransition } from "react";
import { Plus, ChevronDown, ChevronRight, CheckCircle2, Circle, AlertTriangle, Trash2, ClipboardList, Camera, Upload, X, Pencil, Check } from "lucide-react";
import { createFieldLog, createFieldTodo, updateTodoStatus, deleteTodo, uploadFieldLogPhoto, updateFieldLog, deleteFieldLog, updateFieldTodo } from "@/app/actions/field-logs";
import ConfirmButton from "@/components/ui/ConfirmButton";
import StatusBadge, { type StatusKind } from "@/components/ui/StatusBadge";
import type { Database } from "@/types/database";

type FieldLog = Database["public"]["Tables"]["field_logs"]["Row"];
type FieldTodo = Database["public"]["Tables"]["field_todos"]["Row"];

type ProjectRef = { id: string; name: string };

const PRIORITY_KIND: Record<string, StatusKind> = {
  low: "neutral",
  normal: "active",
  urgent: "over",
};

const TODO_STATUS_ICONS = {
  open: <Circle size={16} className="text-gray-400" />,
  in_progress: <Circle size={16} className="text-blue-500" />,
  done: <CheckCircle2 size={16} className="text-green-500" />,
};

function NewLogForm({
  projects,
  onDone,
}: {
  projects: ProjectRef[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState("");

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
            const log = await createFieldLog(fd);
            for (const photo of photos) {
              const pfd = new FormData();
              pfd.append("file", photo);
              pfd.append("project_id", log.project_id);
              pfd.append("field_log_id", log.id);
              pfd.append("log_date", log.log_date);
              await uploadFieldLogPhoto(pfd);
            }
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save log.");
          }
        });
      }}
      className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3"
    >
      <h3 className="font-semibold text-gray-900">New Field Log</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <select
          name="project_id"
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">Select project *</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          name="log_date"
          type="date"
          required
          defaultValue={new Date().toISOString().split("T")[0]}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <textarea
          name="notes"
          required
          placeholder="Field observations, work performed, issues noted... *"
          rows={4}
          className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none"
        />
      </div>

      {/* Photos */}
      <div className="space-y-2">
        {photos.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {photos.map((f, i) => {
              const url = URL.createObjectURL(f);
              return (
                <div
                  key={`${f.name}-${i}`}
                  className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={f.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-white/90 text-gray-600 hover:text-red-600 shadow"
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
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
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
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
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
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "#4272EF" }}
        >
          {isPending ? "Saving..." : "Save Log"}
        </button>
      </div>
    </form>
  );
}

function AddTodoForm({ logId, projectId, onDone }: { logId: string; projectId: string; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("field_log_id", logId);
        fd.set("project_id", projectId);
        startTransition(async () => {
          await createFieldTodo(fd);
          onDone();
        });
      }}
      className="flex flex-wrap gap-2 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100"
    >
      <input
        name="description"
        required
        placeholder="To-do description *"
        className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
      />
      <select name="priority" className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]">
        <option value="normal">Normal</option>
        <option value="low">Low</option>
        <option value="urgent">Urgent</option>
      </select>
      <input
        name="due_date"
        type="date"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
      />
      <button type="submit" disabled={isPending} className="px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: "#4272EF" }}>
        {isPending ? "..." : "Add"}
      </button>
      <button type="button" onClick={onDone} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
        Cancel
      </button>
    </form>
  );
}

function TodoRow({ todo }: { todo: FieldTodo }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(todo.description);
  const [priority, setPriority] = useState(todo.priority);
  const [due, setDue] = useState(todo.due_date ?? "");

  function save() {
    if (!desc.trim()) return;
    startTransition(async () => {
      await updateFieldTodo(todo.id, {
        description: desc.trim(),
        priority,
        due_date: due || null,
      });
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1.5">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          className="flex-1 min-w-40 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="normal">Normal</option>
          <option value="low">Low</option>
          <option value="urgent">Urgent</option>
        </select>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        />
        <button
          onClick={save}
          disabled={!desc.trim() || isPending}
          className="p-1 text-gray-400 hover:text-[#4272EF] disabled:opacity-40"
          aria-label="Save"
          title="Save"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setEditing(false)}
          className="p-1 text-gray-300 hover:text-gray-600"
          aria-label="Cancel"
          title="Cancel"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <button
        onClick={() =>
          startTransition(async () => {
            const next = todo.status === "done" ? "open" : todo.status === "open" ? "in_progress" : "done";
            await updateTodoStatus(todo.id, next);
          })
        }
        className="shrink-0"
      >
        {TODO_STATUS_ICONS[todo.status as keyof typeof TODO_STATUS_ICONS]}
      </button>
      <span className={`flex-1 text-sm ${todo.status === "done" ? "line-through text-gray-400" : "text-gray-800"}`}>
        {todo.description}
      </span>
      <StatusBadge status={PRIORITY_KIND[todo.priority] ?? "neutral"} size="sm">
        {todo.priority}
      </StatusBadge>
      {todo.due_date && (
        <span className="text-xs text-gray-400">{todo.due_date}</span>
      )}
      <button
        onClick={() => setEditing(true)}
        className="text-gray-300 hover:text-[#4272EF] transition-colors"
        aria-label="Edit to-do"
        title="Edit"
      >
        <Pencil size={13} />
      </button>
      <ConfirmButton
        trigger={<Trash2 size={13} />}
        ariaLabel="Delete to-do"
        triggerClassName="text-gray-300 hover:text-red-500 transition-colors"
        title="Delete To-Do?"
        body={<p>Remove &ldquo;{todo.description}&rdquo;? This cannot be undone.</p>}
        confirmLabel="Delete"
        onConfirm={() => deleteTodo(todo.id)}
      />
    </div>
  );
}

function LogCard({
  log,
  todos,
  projects,
}: {
  log: FieldLog;
  todos: FieldTodo[];
  projects: ProjectRef[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [editingLog, setEditingLog] = useState(false);
  const [logDate, setLogDate] = useState(log.log_date);
  const [logNotes, setLogNotes] = useState(log.notes ?? "");
  const [isPending, startTransition] = useTransition();
  const projectName = projects.find((p) => p.id === log.project_id)?.name ?? "Unknown";
  const logTodos = todos.filter((t) => t.field_log_id === log.id);

  function saveLog() {
    if (!logNotes.trim() || !logDate) return;
    startTransition(async () => {
      await updateFieldLog(log.id, { log_date: logDate, notes: logNotes });
      setEditingLog(false);
    });
  }

  function onDeleteLog() {
    startTransition(async () => {
      await deleteFieldLog(log.id);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-gray-50 transition-colors rounded-xl"
      >
        <span className="mt-0.5 text-gray-400 shrink-0">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-gray-900">{log.log_date}</span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{projectName}</span>
            {logTodos.length > 0 && (
              <span className="text-xs text-gray-400">{logTodos.filter(t => t.status !== "done").length} open to-dos</span>
            )}
          </div>
          <p className="text-sm text-gray-600 line-clamp-2">{log.notes}</p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {editingLog ? (
            <div className="space-y-2">
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
              />
              <textarea
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                rows={4}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveLog}
                  disabled={isPending || !logNotes.trim() || !logDate}
                  className="px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50"
                  style={{ backgroundColor: "#4272EF" }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingLog(false);
                    setLogDate(log.log_date);
                    setLogNotes(log.notes ?? "");
                  }}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm text-gray-700 whitespace-pre-wrap">{log.notes}</p>
              <button
                onClick={() => setEditingLog(true)}
                className="text-gray-300 hover:text-[#4272EF] transition-colors shrink-0"
                aria-label="Edit log"
                title="Edit log"
              >
                <Pencil size={14} />
              </button>
              <ConfirmButton
                trigger={<Trash2 size={14} />}
                ariaLabel="Delete field log"
                triggerClassName="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                title="Delete Field Log?"
                body={
                  <p>
                    This will permanently remove this log{logTodos.length > 0 ? ` and its ${logTodos.length} to-do${logTodos.length !== 1 ? "s" : ""}` : ""}. This cannot be undone.
                  </p>
                }
                confirmLabel="Delete"
                onConfirm={onDeleteLog}
              />
            </div>
          )}

          {/* To-dos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To-Dos</span>
              <button
                onClick={() => setShowAddTodo(true)}
                className="text-xs flex items-center gap-1 font-medium hover:opacity-80"
                style={{ color: "#4272EF" }}
              >
                <Plus size={13} /> Add To-Do
              </button>
            </div>
            {showAddTodo && (
              <AddTodoForm logId={log.id} projectId={log.project_id} onDone={() => setShowAddTodo(false)} />
            )}
            {logTodos.length === 0 && !showAddTodo ? (
              <p className="text-xs text-gray-400">No to-dos for this log.</p>
            ) : (
              <div className="space-y-1">
                {logTodos.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FieldLogsClient({
  logs,
  projects,
  todos,
}: {
  logs: FieldLog[];
  projects: ProjectRef[];
  todos: FieldTodo[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [filterProject, setFilterProject] = useState("");

  const filtered = filterProject ? logs.filter((l) => l.project_id === filterProject) : logs;

  // All standalone todos (not tied to a log)
  const standaloneTodos = todos.filter((t) => !t.field_log_id);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg"
          style={{ backgroundColor: "#4272EF" }}
        >
          <Plus size={15} /> New Log
        </button>
      </div>

      {showAdd && <NewLogForm projects={projects} onDone={() => setShowAdd(false)} />}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center">
          <ClipboardList size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No field logs yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((log) => (
            <LogCard key={log.id} log={log} todos={todos} projects={projects} />
          ))}
        </div>
      )}

      {standaloneTodos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Standalone To-Dos
          </h3>
          <div className="space-y-2">
            {standaloneTodos.map((todo) => {
              const projectName = projects.find((p) => p.id === todo.project_id)?.name;
              return (
                <div key={todo.id} className="flex items-center gap-2 py-1">
                  {TODO_STATUS_ICONS[todo.status as keyof typeof TODO_STATUS_ICONS]}
                  <span className="flex-1 text-sm text-gray-800">{todo.description}</span>
                  {projectName && <span className="text-xs text-gray-400">{projectName}</span>}
                  <StatusBadge status={PRIORITY_KIND[todo.priority] ?? "neutral"} size="sm">
                    {todo.priority}
                  </StatusBadge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
