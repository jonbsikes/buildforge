import { View, Text } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "../pdf/ReportDocument";
import { styles, colors } from "../pdf/styles";
import {
  fmtDate,
  formatDateRange,
  SectionHeading,
  SubHeading,
  Empty,
} from "../pdf/components";
import type { ReportParams } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Todo {
  id: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
}

interface FieldLog {
  log_date: string;
  notes: string;
  project_name: string;
  todos: Todo[];
}

export interface FieldLogsData {
  logs: FieldLog[];
  projectName?: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

export async function getData(p: ReportParams): Promise<FieldLogsData> {
  const supabase = await createClient();
  const start = p.start || "2000-01-01";
  const end = p.end || "2099-12-31";

  // Fetch logs. Aliased joins aren't inferred by PostgREST types.
  type FieldLogRow = {
    id: string;
    log_date: string;
    notes: string;
    project: { id: string; name: string } | null;
  };
  const { data: logsData } = await supabase
    .from("field_logs")
    .select(
      `id, log_date, notes,
       project:projects(id, name)`
    )
    .gte("log_date", start)
    .lte("log_date", end)
    .order("log_date", { ascending: false });

  // Filter by projectId if provided
  let filteredLogs = ((logsData ?? []) as unknown as FieldLogRow[]);
  if (p.projectId) {
    filteredLogs = filteredLogs.filter((l) => l.project?.id === p.projectId);
  }

  // Fetch todos
  const { data: todosData } = await supabase
    .from("field_todos")
    .select("id, field_log_id, description, status, priority, due_date");

  const todosByLog: Record<string, Todo[]> = {};
  for (const t of todosData ?? []) {
    if (!t.field_log_id) continue;
    if (!todosByLog[t.field_log_id]) todosByLog[t.field_log_id] = [];
    todosByLog[t.field_log_id]!.push(t);
  }

  const logs: FieldLog[] = filteredLogs.map((l) => ({
    log_date: l.log_date,
    notes: l.notes,
    project_name: l.project?.name ?? "—",
    todos: todosByLog[l.id] ?? [],
  }));

  // Get project name if projectId provided
  let projectName: string | undefined;
  if (p.projectId) {
    const { data: proj } = await supabase
      .from("projects")
      .select("name")
      .eq("id", p.projectId)
      .single();
    projectName = proj?.name;
  }

  return { logs, projectName };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function Pdf({ data, params, logo }: { data: FieldLogsData; params: ReportParams; logo?: Buffer | string }) {
  const subtitle = data.projectName
    ? `${data.projectName} — ${formatDateRange(params.start || "2000-01-01", params.end || "2099-12-31")}`
    : formatDateRange(params.start || "2000-01-01", params.end || "2099-12-31");

  return (
    <ReportDocument
      title="Field Logs Report"
      subtitle={subtitle}
      logo={logo}
    >
      {data.logs.length === 0 ? (
        <Empty>No field logs for this period.</Empty>
      ) : (
        <View>
          {data.logs.map((log, i) => (
            <View key={i} style={{ marginBottom: 12 }} wrap={false}>
              <SubHeading>{fmtDate(log.log_date)} • {log.project_name}</SubHeading>
              <View style={{ marginLeft: 12, marginBottom: 8 }}>
                <Text style={[styles.td, { marginBottom: 6 }]}>
                  {log.notes}
                </Text>
              </View>

              {log.todos.length > 0 && (
                <View style={{ marginLeft: 12, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: colors.line }}>
                  {log.todos.map((todo, j) => {
                    const isDone = todo.status === "done";
                    const priorityColor =
                      todo.priority === "urgent"
                        ? colors.red
                        : todo.priority === "normal"
                        ? colors.brand
                        : colors.muted;
                    return (
                      <View key={j} style={{ marginBottom: 3, flexDirection: "row" }}>
                        <Text
                          style={[
                            styles.td,
                            {
                              color: isDone ? colors.faint : priorityColor,
                              textDecoration: isDone ? "line-through" : "none",
                              marginRight: 8,
                              flex: 1,
                            },
                          ]}
                        >
                          {isDone ? "✓" : "◦"} {todo.description}
                        </Text>
                        {todo.due_date && !isDone && (
                          <Text style={[styles.td, { color: colors.faint, marginLeft: 8 }]}>
                            {fmtDate(todo.due_date)}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ReportDocument>
  );
}
