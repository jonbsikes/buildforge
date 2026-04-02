"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

type TodoStatus = "open" | "in_progress" | "done";
type TodoPriority = "low" | "normal" | "urgent";

interface Todo {
  id: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  due_date: string | null;
  field_log_id: string | null;
  log_date: string | null;
  created_at: string;
}

const statusCycle: Record<TodoStatus, TodoStatus> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
};

const statusStyles: Record<TodoStatus, string> = {
  open: "bg-gray-100 text-gray-600",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
};

const statusLabels: Record<TodoStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
};

const priorityStyles: Record<TodoPriority, string> = {
  low: "bg-gray-100 text-gray-500",
  normal: "bg-blue-100 text-blue-700",
  urgent: "bg-red-100 text-red-700",
};

const priorityOrder: Record<TodoPriority, number> = { urgent: 0, normal: 1, low: 2 };

export default function TodosClient({ projectId, todos: initial }: { projectId: string; todos: Todo[] }) {
  const supabase = createClient();
  const [todos, setTodos] = useState(initial);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | TodoStatus>("all");
  const [filterPriority, setFilterPriority] = useState<"all" | TodoPriority>("all");

  async function cycleStatus(todo: Todo) {
    const next = statusCycle[todo.status];
    setUpdating(todo.id);
    const resolved_date = next === "done" ? new Date().toISOString().split("T")[0] : null;
    await supabase.from("field_todos").update({ status: next, resolved_date }).eq("id", todo.id);
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, status: next } : t)));
    setUpdating(null);
  }

  const filtered = todos
    .filter((t) => filterStatus === "all" || t.status === filterStatus)
    .filter((t) => filterPriority === "all" || t.priority === filterPriority)
    .sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  const openCount = todos.filter((t) => t.status !== "done").length;

  return (
    <div className="space-y-4">
      {/* Stats + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{openCount}</span> open ·{" "}
          <span className="font-semibold text-gray-900">{todos.length}</span> total
        </p>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as typeof filterPriority)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4272EF]"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200">
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <ClipboardList size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No to-dos match your filters.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {filtered.map((todo) => {
              const isDone = todo.status === "done";
              const isOverdue = todo.due_date && !isDone && new Date(todo.due_date) < new Date();

              return (
                <li key={todo.id} className="px-5 py-3.5 flex items-center gap-3">
                  <button
                    onClick={() => cycleStatus(todo)}
                    disabled={updating === todo.id}
                    className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      isDone ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-[#4272EF]"
                    }`}
                  >
                    {isDone && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isDone ? "line-through text-gray-400" : "text-gray-800"}`}>
                      {todo.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {todo.due_date && (
                        <span className={`text-xs ${isOverdue ? "text-red-500 font-medium" : "text-gray-400"}`}>
                          {isOverdue ? "Overdue · " : "Due "}
                          {new Date(todo.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {todo.field_log_id && todo.log_date && (
                        <Link
                          href={`/projects/${projectId}/field-logs/${todo.field_log_id}`}
                          className="text-xs text-gray-400 hover:text-[#4272EF]"
                        >
                          Log {new Date(todo.log_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </Link>
                      )}
                    </div>
                  </div>

                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${priorityStyles[todo.priority]}`}>
                    {todo.priority}
                  </span>
                  <button
                    onClick={() => cycleStatus(todo)}
                    disabled={updating === todo.id}
                    className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusStyles[todo.status]} hover:opacity-80`}
                  >
                    {statusLabels[todo.status]}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
