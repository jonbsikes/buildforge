"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import StatusBadge, { type StatusKind } from "@/components/ui/StatusBadge";

type TodoStatus = "open" | "in_progress" | "done";
type TodoPriority = "low" | "normal" | "urgent";

interface Todo {
  id: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  due_date: string | null;
}

const statusCycle: Record<TodoStatus, TodoStatus> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
};

const statusLabels: Record<TodoStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
};

const statusKinds: Record<TodoStatus, StatusKind> = {
  open: "neutral",
  in_progress: "warning",
  done: "complete",
};

const priorityKinds: Record<TodoPriority, StatusKind> = {
  low: "neutral",
  normal: "active",
  urgent: "over",
};

export default function TodoList({
  todos: initial,
}: {
  todos: Todo[];
}) {
  const supabase = createClient();
  const [todos, setTodos] = useState(initial);
  const [updating, setUpdating] = useState<string | null>(null);

  async function cycleStatus(todo: Todo) {
    const next = statusCycle[todo.status];
    setUpdating(todo.id);
    const resolved_date = next === "done" ? new Date().toISOString().split("T")[0] : null;
    await supabase
      .from("field_todos")
      .update({ status: next, resolved_date })
      .eq("id", todo.id);
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, status: next } : t)));
    setUpdating(null);
  }

  return (
    <ul className="divide-y divide-gray-50">
      {todos.map((todo) => {
        const isDone = todo.status === "done";
        const isOverdue =
          todo.due_date && !isDone && new Date(todo.due_date) < new Date();

        return (
          <li key={todo.id} className="px-5 py-3.5 flex items-center gap-3">
            <button
              onClick={() => cycleStatus(todo)}
              disabled={updating === todo.id}
              className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                isDone
                  ? "bg-green-500 border-green-500"
                  : "border-gray-300 hover:border-[#4272EF]"
              }`}
              title={`Mark as ${statusCycle[todo.status]}`}
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
              {todo.due_date && (
                <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-500 font-medium" : "text-gray-400"}`}>
                  {isOverdue ? "Overdue · " : "Due "}
                  {new Date(todo.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              )}
            </div>

            <span className="shrink-0">
              <StatusBadge status={priorityKinds[todo.priority]} size="sm">
                {todo.priority}
              </StatusBadge>
            </span>

            <button
              onClick={() => cycleStatus(todo)}
              disabled={updating === todo.id}
              className="shrink-0 hover:opacity-80"
            >
              <StatusBadge status={statusKinds[todo.status]} size="sm">
                {statusLabels[todo.status]}
              </StatusBadge>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
