-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enums
create type project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');
create type stage_status as enum ('not_started', 'in_progress', 'completed', 'blocked');
create type cost_category as enum (
  'land', 'siteworks', 'foundation', 'framing', 'roofing',
  'electrical', 'plumbing', 'hvac', 'insulation', 'drywall',
  'flooring', 'cabinetry', 'painting', 'landscaping', 'permits',
  'professional_fees', 'contingency', 'other'
);

-- Projects
create table projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  address text,
  description text,
  status project_status not null default 'planning',
  total_budget numeric(15, 2) not null default 0,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stages
create table stages (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  description text,
  status stage_status not null default 'not_started',
  order_index integer not null default 0,
  budget numeric(15, 2) not null default 0,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cost items
create table cost_items (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  stage_id uuid references stages(id) on delete set null,
  category cost_category not null default 'other',
  description text not null,
  budgeted_amount numeric(15, 2) not null default 0,
  actual_amount numeric(15, 2) not null default 0,
  vendor text,
  invoice_date date,
  invoice_number text,
  invoice_file_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Invoices
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  cost_item_id uuid references cost_items(id) on delete set null,
  file_path text not null,
  file_name text not null,
  vendor text,
  invoice_number text,
  invoice_date date,
  total_amount numeric(15, 2),
  extracted_data jsonb,
  processed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Updated_at trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at();
create trigger stages_updated_at before update on stages
  for each row execute function update_updated_at();
create trigger cost_items_updated_at before update on cost_items
  for each row execute function update_updated_at();
create trigger invoices_updated_at before update on invoices
  for each row execute function update_updated_at();

-- Row Level Security
alter table projects enable row level security;
alter table stages enable row level security;
alter table cost_items enable row level security;
alter table invoices enable row level security;

-- RLS Policies: users can only access their own data
create policy "Users own projects" on projects
  for all using (auth.uid() = user_id);

create policy "Users access stages via projects" on stages
  for all using (
    exists (
      select 1 from projects where projects.id = stages.project_id and projects.user_id = auth.uid()
    )
  );

create policy "Users access cost_items via projects" on cost_items
  for all using (
    exists (
      select 1 from projects where projects.id = cost_items.project_id and projects.user_id = auth.uid()
    )
  );

create policy "Users access invoices via projects" on invoices
  for all using (
    exists (
      select 1 from projects where projects.id = invoices.project_id and projects.user_id = auth.uid()
    )
  );

-- Storage bucket for invoices
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false);

create policy "Users can upload invoices" on storage.objects
  for insert with check (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can read own invoices" on storage.objects
  for select using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own invoices" on storage.objects
  for delete using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
