-- ============================================================
-- Migration 005: Field Logs & To-Dos
-- ============================================================

-- ── field_logs ──
create table field_logs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  project_stage_id uuid references project_stages(id) on delete set null,
  log_date date not null default current_date,
  notes text not null,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz not null default now()
);
alter table field_logs enable row level security;
create policy "Users access field_logs via projects" on field_logs
  for all using (
    exists (select 1 from projects where projects.id = field_logs.project_id and projects.user_id = auth.uid())
  );

-- ── field_todos ──
create table field_todos (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  field_log_id uuid references field_logs(id) on delete set null,
  description text not null,
  status text not null default 'open',          -- 'open', 'in_progress', 'done'
  priority text not null default 'normal',       -- 'low', 'normal', 'urgent'
  due_date date,
  resolved_date date,
  created_by uuid references auth.users(id) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger field_todos_updated_at before update on field_todos
  for each row execute function update_updated_at();
alter table field_todos enable row level security;
create policy "Users access field_todos via projects" on field_todos
  for all using (
    exists (select 1 from projects where projects.id = field_todos.project_id a