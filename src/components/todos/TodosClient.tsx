"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { createTodo, completeTodo, reopenTodo, deleteTodo } from "@/app/actions/todos";
import { Plus, Circle, CheckCircle2, Trash2, RotateCcw } from "lucide-react";

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

const PRIORITY_COLORS: Record<string, string> = {
  low:    "text-gray-400 bg-gray-100",
  normal: "text-blue-600 bg-blue-50",
  urgent: "text-red-600 bg-red-50",
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
    startAdd(async () => {
      await deleteTodo(todo.id, todo.project_id);
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
            className={"px-4 py-2 text-sm font-medium border-b-2 transition-colors " + (tab === t ? "border-[#4272EF] text-[#4272EF]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            {t === "open" ? "Open" : "Completed"}
            <span className={"ml-1.5 text-xs px-1.5 py-0.5 rounded-full " + (t === "open" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500")}>
              {t === "open" ? openTodos.length : doneTodos.length}
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
                {items.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <button
                      onClick={() => handleComplete(t)}
                      className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-green-500 transition-colors"
                      title="Mark complete"
                    >
                      <Circle size={18} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{t.description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={"text-xs px-1.5 py-0.5 rounded font-medium " + (PRIORITY_COLORS[t.priority] ?? "text-gray-500 bg-gray-100")}>
                          {t.priority}
                        </span>
                        {t.due_date && (
                          <span className={"text-xs " + (isOverdue(t.due_date) ? "text-red-500 font-medium" : "text-gray-400")}>
                            due {t.due_date}{isOverdue(t.due_date) ? " · overdue" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(t)}
                      className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors mt-0.5"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
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
                className="flex-shrink-0 text-gray-300 hover:text-[#4272EF] transition-colors mt-0.5"
                title="Reopen"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={() => handleDelete(t)}
                className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors mt-0.5"
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
