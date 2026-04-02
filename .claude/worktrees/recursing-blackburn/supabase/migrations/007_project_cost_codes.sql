create table if not exists project_cost_codes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  cost_code_id uuid references cost_codes(id) on delete cascade not null,
  budgeted_amount numeric(15, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, cost_code_id)
);

create trigger project_cost_codes_updated_at before update on project_cost_codes
  for each row execute function update_updated_at();

alter table project_cost_codes enable row level security;

create policy "Users access project_cost_codes via projects" on project_cost_codes
  for all using (
    exists (
      select 1 from projects where projects.id = project_cost_codes.project_id and projects.user_id = auth.uid()
    )
  );
