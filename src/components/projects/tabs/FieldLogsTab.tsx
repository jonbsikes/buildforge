"use client";

import { useState, useTransition, useEffect } from "react";
import { Plus, ChevronDown, ChevronRight, Circle, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createProjectFieldLog,
  createProjectFieldTodo,
  updateProjectTodoStatus,
} from "@/app/(app)/projects/[id]/actions";

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

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-gray-400",
  normal: "text-blue-500",
  urgent: "text-red-500",
};

const TODO_CYCLE: Record<string, string> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
};

// ── New log form ─────────────────────────────────────────────────────────────
function NewLogForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [isPending, startTransition] = useTransition();
  const today = new Date().toISOString().split("T")[0]!;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          await createProjectFieldLog(projectId, fd);
          (e.target as HTMLFormElement).reset();
          onCreated();
        });
      }}
      className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3"
    >
      <h3 className="text-sm font-semibold text-gray-800">New Field Log</h3>
      <div className="flex gap-3">
        <input
          name="log_date"
          type="date"
          defaultValue={today}
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] bg-white"
        />
      </div>
      <textarea
        name="notes"
        placeholder="What happened on site today?"
        required
        rows={3}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] resize-none"
      />
      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
        >
          {isPending && <Loader2 size={13} className="animate-spin" />}
          Save Log
        </button>
      </div>
    </form>
  );
}

// ── Add todo form (inline beneath a log) ────────────────────────────────────
function AddTodoForm({ projectId, logId, onCreated }: { projectId: string; logId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-[#4272EF] flex items-center gap-1 hover:underline mt-1"
      >
        <Plus size={12} /> Add to-do
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
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <input
        name="description"
        placeholder="To-do description"
        required
        className="flex-1 min-w-40 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#4272EF]"
      />
      <select
        name="priority"
        defaultValue="normal"
        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#4272EF]"
      >
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="urgent">Urgent</option>
      </select>
      <input
        name="due_date"
        type="date"
        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#4272EF]"
      />
      <button
        type="submit"
        disabled={isPending}
        className="px-3 py-1.5 bg-[#4272EF] text-white rounded-lg text-xs font-medium hover:bg-[#3461de] transition-colors disabled:opacity-60"
      >
        {isPending ? "…" : "Add"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">
        Cancel
      </button>
    </form>
  );
}

// ── Todo row ─────────────────────────────────────────────────────────────────
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
  return (
    <div className="flex items-start gap-2 py-1">
      <button
        onClick={cycle}
        disabled={isPending}
        className="mt-0.5 flex-shrink-0 disabled:opacity-50"
        title={`Status: ${todo.status} — click to advance`}
      >
        {done
          ? <CheckCircle2 size={14} className="text-green-500" />
          : <Circle size={14} className={PRIORITY_COLORS[todo.priority] ?? "text-gray-400"} />
        }
      </button>
      <span className={`text-xs flex-1 ${done ? "line-through text-gray-400" : "text-gray-700"}`}>
        {todo.description}
      </span>
      {todo.due_date && !done && (
        <span className="text-xs text-gray-400 flex-shrink-0">{todo.due_date}</span>
      )}
    </div>
  );
}

// ── Log row ───────────────────────────────────────────────────────────────────
function LogRow({ log, todos, projectId, onRefresh }: {
  log: FieldLog;
  todos: Todo[];
  projectId: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const openCount = todos.filter((t) => t.status !== "done").length;

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-shrink-0 text-gray-400 mt-0.5">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </div>
        <div className="flex-shrink-0 w-24">
          <span className="text-xs font-mono text-gray-500">{log.log_date}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 line-clamp-2">{log.notes}</p>
        </div>
        {todos.length > 0 && (
          <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
            openCount > 0 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
          }`}>
            {openCount > 0 ? `${openCount} open` : "all done"}
          </span>
        )}
      </button>

      {expanded && (
        <div className="ml-12 px-4 pb-4">
          {/* Full notes if truncated above */}
          <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap">{log.notes}</p>
          {/* Todos */}
          {todos.length > 0 && (
            <div className="mb-2 space-y-0.5">
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

// ── Main component ────────────────────────────────────────────────────────────
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

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {logs.length} log{logs.length !== 1 ? "s" : ""}
          {Object.values(todosByLog).flat().filter((t) => t.status !== "done").length > 0 && (
            <span className="ml-2 text-amber-600 font-medium">
              · {Object.values(todosByLog).flat().filter((t) => t.status !== "done").length} open to-dos
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] transition-colors"
        >
          <Plus size={14} />
          New Log
        </button>
      </div>

      {showForm && (
        <NewLogForm
          projectId={projectId}
          onCreated={() => { setShowForm(false); load(); }}
        />
      )}

      {logs.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No field logs yet. Click &ldquo;New Log&rdquo; to add the first one.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          {logs.map((log) => (
            <LogRow
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
