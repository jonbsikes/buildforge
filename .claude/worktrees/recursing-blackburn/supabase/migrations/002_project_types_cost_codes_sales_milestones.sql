-- ============================================================
-- Migration 002: Project types, cost codes, sales, milestones
-- ============================================================

-- Project type enum
create type project_type as enum ('land_development', 'home_construction');

-- Add project_type to projects
alter table projects
  add column project_type project_type not null default 'home_construction';

-- ============================================================
-- Cost Codes (user-defined, optionally scoped to project type)
-- ============================================================
create table cost_codes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_type project_type, -- null = applies to both types
  code text not null,         -- e.g. "CON-003"
  name text not null,         -- e.g. "Concrete Works"
  category cost_category not null default 'other',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);

create trigger cost_codes_updated_at before update on cost_codes
  for each row execute function update_updated_at();

alter table cost_codes enable row level security;
create policy "Users own cost codes" on cost_codes
  for all using (auth.uid() = user_id);

-- Link cost_items to cost_codes
alter table cost_items
  add column cost_code_id uuid references cost_codes(id) on delete set null;

-- ============================================================
-- Sales / Revenue
-- ============================================================
create type sale_type as enum (
  'lot_sale',
  'house_sale',
  'progress_payment',
  'deposit',
  'variation',
  'other'
);

create table sales (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  sale_type sale_type not null default 'other',
  description text not null,
  buyer_name text,
  contract_price numeric(15, 2),
  deposit_amount numeric(15, 2),
  deposit_received_date date,
  settlement_date date,
  is_settled boolean not null default false,
  settled_amount numeric(15, 2),
  settled_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sales_updated_at before update on sales
  for each row execute function update_updated_at();

alter table sales enable row level security;
create policy "Users access sales via projects" on sales
  for all using (
    exists (
      select 1 from projects where projects.id = sales.project_id and projects.user_id = auth.uid()
    )
  );

-- ============================================================
-- Milestones (project schedule)
-- ============================================================
create table milestones (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  stage_id uuid references stages(id) on delete set null,
  name text not null,
  due_date date,
  completed_date date,
  is_completed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger milestones_updated_at before update on milestones
  for each row execute function update_updated_at();

alter table milestones enable row level security;
create policy "Users access milestones via projects" on milestones
  for all using (
    exists (
      select 1 from projects where projects.id = milestones.project_id and projects.user_id = auth.uid()
    )
  );

-- ============================================================
-- Seed default cost codes for home construction
-- NOTE: Run this after creating your first user, or use a
-- function that seeds per-user. These are template defaults —
-- the app will insert them per user on first use.
-- ============================================================
