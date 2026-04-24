"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { createTodo, completeTodo, reopenTodo, deleteTodo, updateTodo } from "@/app/actions/todos";
import { Plus, Circle, CheckCircle2, Trash2, RotateCcw, Pencil, Check, X } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import type { StatusKind } from "@/components/ui/StatusBadge";

interface Project { id: string; name: string }

interface Todo {
  id: string;
  description: string;
  priority: string;
  due_date: string | null;
  status: string;
  project_id: string;
  resolved_date: string | null;
  created_at: string;
}

const PRIORITY_KIND: Record<string, StatusKind> = {
  low: "neutral",
  normal: "active",
  urgent: "over",
};

function isOverdue(due: string | null) {
  if (!due) return false;
  return due < new Date().toISOString().split("T")[0]!;
}

export default function TodosClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"open" | "completed">("open");

  // New todo form state
  const [desc, setDesc] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isAdding, startAdd] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("field_todos").select("id, description, priority, due_date, status, project_id, resolved_date, created_at").order("created_at", { ascending: false }),
    ]).then(([projRes, todosRes]) => {
      const projs = projRes.data ?? [];
      setProjects(projs);
      if (projs.length > 0 && !projectId) setProjectId(projs[0]!.id);
      setTodos(todosRes.data ?? []);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshTodos() {
    const supabase = createClient();
    supabase.from("field_todos").select("id, description, priority, due_date, status, project_id, resolved_date, created_at").order("created_at", { ascending: false }).then(({ data }) => {
      setTodos(data ?? []);
    });
  }

  function handleAdd() {
    if (!desc.trim()) { setFormError("Description is required"); return; }
    if (!projectId) { setFormError("Select a project"); return; }
    setFormError(null);
    startAdd(async () => {
      const res = await createTodo({ project_id: projectId, description: desc.trim(), priority, due_date: dueDate || null });
      if (res.error) { setFormError(res.error); return; }
      setDesc("");
      setDueDate("");
      refreshTodos();
    });
  }

  function handleComplete(todo: Todo) {
    startAdd(async () => {
      await completeTodo(todo.id, todo.project_id);
      refreshTodos();
    });
  }

  function handleReopen(todo: Todo) {
    startAdd(async () => {
      await reopenTodo(todo.id, todo.project_id);
      refreshTodos();
    });
  }

  function handleDelete(todo: Todo) {
    if (!confirm(`Delete "${todo.description}"?`)) return;
    startAdd(async () => {
      await deleteTodo(todo.id, todo.project_id);
      refreshTodos();
    });
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState("normal");
  const [editDue, setEditDue] = useState("");

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setEditDesc(todo.description);
    setEditPriority(todo.priority);
    setEditDue(todo.due_date ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(todo: Todo) {
    if (!editDesc.trim()) return;
    startAdd(async () => {
      await updateTodo(todo.id, todo.project_id, {
        description: editDesc.trim(),
        priority: editPriority,
        due_date: editDue || null,
      });
      setEditingId(null);
      refreshTodos();
    });
  }

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const openTodos = todos.filter((t) => t.status !== "done");
  const doneTodos = todos.filter((t) => t.status === "done");

  // Group open todos by project
  const byProject: Record<string, Todo[]> = {};
  for (const t of openTodos) {
    if (!byProject[t.project_id]) byProject[t.project_id] = [];
    byProject[t.project_id]!.push(t);
  }

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add To-Do</h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF] min-w-40"
          >
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="What needs to be done?"
            className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          />
          <button
            onClick={handleAdd}
            disabled={isAdding}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#4272EF] text-white rounded-lg text-sm font-medium hover:bg-[#3461de] disabled:opacity-60 transition-colors"
          >
            <Plus size={15} /> Add
          </button>
        </div>
        {formError && <p className="mt-2 text-xs text-red-500">{formError}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["open", "completed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={"px-4 py-2 text-sm font-medium border-b-2 transition-colors " + (tab === t ? "border-[color:var(--brand-blue)] text-[color:var(--brand-blue)]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            {t === "open" ? "Open" : "Completed"}
            <span className="ml-1.5 text-xs text-gray-400 tabular-nums">
              ({t === "open" ? openTodos.length : doneTodos.length})
            </span>
          </button>
        ))}
      </div>

      {/* Open tab — grouped by project */}
      {tab === "open" && (
        <div className="space-y-4">
          {openTodos.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">No open to-dos. Nice work!</div>
          )}
          {Object.entries(byProject).map(([pid, items]) => (
            <div key={pid} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{projectMap[pid] ?? "Unknown"}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map((t) => {
                  const isEditing = editingId === t.id;
                  return (
                    <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                      <button
                        onClick={() => handleComplete(t)}
                        disabled={isEditing}
                        className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-green-500 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-30"
                        aria-label={`Mark "${t.description}" complete`}
                        title="Mark complete"
                      >
                        <Circle size={18} />
                      </button>
                      {isEditing ? (
                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                          <input
                            type="text"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(t);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            autoFocus
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
                          />
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={editPriority}
                              onChange={(e) => setEditPriority(e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
                            >
                              <option value="low">Low</option>
                              <option value="normal">Normal</option>
                              <option value="urgent">Urgent</option>
                            </select>
                            <input
                              type="date"
                              value={editDue}
                              onChange={(e) => setEditDue(e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800">{t.description}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <StatusBadge status={PRIORITY_KIND[t.priority] ?? "neutral"} size="sm">
                              {t.priority}
                            </StatusBadge>
                            {t.due_date && (
                              <span
                                className="text-xs"
                                style={isOverdue(t.due_date) ? { color: "var(--status-over)", fontWeight: 500 } : { color: "var(--text-muted)" }}
                              >
                                due {t.due_date}{isOverdue(t.due_date) ? " · overdue" : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(t)}
                            disabled={!editDesc.trim() || isAdding}
                            className="flex-shrink-0 text-gray-400 hover:text-[#4272EF] transition-colors mt-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-40"
                            aria-label="Save changes"
                            title="Save"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex-shrink-0 text-gray-300 hover:text-gray-600 transition-colors mt-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label="Cancel edit"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => startEdit(t)}
                            className="flex-shrink-0 text-gray-300 hover:text-[#4272EF] transition-colors mt-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label={`Edit "${t.description}"`}
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(t)}
                            className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors mt-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            aria-label={`Delete "${t.description}"`}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed tab */}
      {tab === "completed" && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {doneTodos.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">No completed to-dos yet.</div>
          )}
          {doneTodos.map((t) => (
            <div key={t.id} className="flex items-start gap-3 px-4 py-3">
              <CheckCircle2 size={18} className="text-green-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-400 line-through">{t.description}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-[#4272EF] font-medium">{projectMap[t.project_id] ?? "—"}</span>
                  {t.resolved_date && <span className="text-xs text-gray-400">completed {t.resolved_date}</span>}
                </div>
              </div>
              <button
                onClick={() => handleReopen(t)}
                className="flex-shrink-0 text-gray-300 hover:text-[#4272EF] transition-colors mt-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={`Reopen "${t.description}"`}
                title="Reopen"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={() => handleDelete(t)}
                className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors mt-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={`Delete "${t.description}"`}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
