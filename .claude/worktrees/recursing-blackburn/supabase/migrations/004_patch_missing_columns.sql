-- ============================================================
-- Migration 004: Patch — add missing columns and tables
-- Safe to run even if 003 was partially applied.
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── contacts (needed before projects lender_id FK) ──
create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  type text not null default 'other',
  company text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);
alter table contacts enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'contacts' and policyname = 'Users own contacts'
  ) then
    create policy "Users own contacts" on contacts for all using (auth.uid() = user_id);
  end if;
end $$;

-- ── projects: add missing columns ──
alter table projects
  add column if not exists contract_price numeric(15,2),
  add column if not exists lender_id uuid references contacts(id) on delete set null,
  add column if not exists target_close date;

-- ── cost_codes: replace if still old UUID-based table ──
do $$ begin
  -- Only recreate if cost_codes uses a uuid PK (old schema)
  if exists (
    select 1 from information_schema.columns
    where table_name = 'cost_codes' and column_name = 'id' and data_type = 'uuid'
  ) then
    alter table cost_items drop column if exists cost_code_id;
    drop table if exists cost_codes cascade;
  end if;
end $$;

create table if not exists cost_codes (
  code integer primary key,
  category text not null,
  description text not null
);
alter table cost_codes enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'cost_codes' and policyname = 'Public read cost codes'
  ) then
    create policy "Public read cost codes" on cost_codes for select using (true);
  end if;
end $$;

insert into cost_codes (code, category, description) values
(1,'Land Development','Raw Land'),(2,'Land Development','Closing Costs'),
(3,'Land Development','Survey'),(4,'Land Development','Filing Fees'),
(5,'Land Development','Permitting Fees'),(6,'Land Development','Taxes'),
(7,'Land Development','Legal'),(8,'Land Development','Engineering'),
(9,'Land Development','Environmental Study / Phase 1'),(10,'Land Development','Geotechnical / Soil Testing'),
(11,'Land Development','Site Clearing'),(12,'Land Development','Earth Work'),
(13,'Land Development','Detention / Retention Pond'),(14,'Land Development','Water'),
(15,'Land Development','Storm Sewer'),(16,'Land Development','Sanitary Sewer'),
(17,'Land Development','Paving'),(18,'Land Development','Flatwork'),
(19,'Land Development','Utilities - Electrical'),(20,'Land Development','Utilities - Gas'),
(21,'Land Development','Utilities - Internet'),(22,'Land Development','Fencing'),
(23,'Land Development','Signage'),(24,'Land Development','Street Signs'),
(25,'Land Development','Monument Signs / Entry Features'),(26,'Land Development','Postal Service Boxes'),
(27,'Land Development','Landscaping'),(28,'Land Development','Irrigation'),
(29,'Land Development','Street Lights'),(30,'Land Development','HOA Setup'),
(31,'Land Development','Marketing'),(32,'Land Development','Sales / Model Home Costs'),
(33,'Land Development','Miscellaneous'),
(34,'Home Construction','Lot'),(35,'Home Construction','Closing Cost (Loan)'),
(36,'Home Construction','Loan Origination Fee'),(37,'Home Construction','Permits & Inspection Fees'),
(38,'Home Construction','Pre-Construction Survey'),(39,'Home Construction','Foundation Survey'),
(40,'Home Construction','Property Taxes'),(41,'Home Construction','Engineering/Plans'),
(42,'Home Construction','Insurance - Builders Risk'),(43,'Home Construction','Site Prep / Tree Clearing'),
(44,'Home Construction','Concrete - Foundation'),(45,'Home Construction','Grade - Rough'),
(46,'Home Construction','Grade - Final'),(47,'Home Construction','Frame - Material'),
(48,'Home Construction','Framing - Labor'),(49,'Home Construction','Roofing - Turn Key'),
(50,'Home Construction','Insulation - Turn Key'),(51,'Home Construction','Siding - Labor'),
(52,'Home Construction','Sheetrock - Materials'),(53,'Home Construction','Sheetrock - Labor'),
(54,'Home Construction','Water Well System'),(55,'Home Construction','Brick - Material'),
(56,'Home Construction','Brick - Sand'),(57,'Home Construction','Brick - Labor'),
(58,'Home Construction','Fireplace/Masonry Features'),(59,'Home Construction','Garage Door - Rough'),
(60,'Home Construction','Garage Door - Final'),(61,'Home Construction','Trim - Material'),
(62,'Home Construction','Trim - Exterior Doors'),(63,'Home Construction','Trim - Interior Doors'),
(64,'Home Construction','Windows'),(65,'Home Construction','Trim - Hardware'),
(66,'Home Construction','Trim - Labor'),(67,'Home Construction','Cabinets - Material'),
(68,'Home Construction','Cabinets - Labor'),(69,'Home Construction','Paint - Interior Turn Key'),
(70,'Home Construction','Paint - Exterior Turn Key'),(71,'Home Construction','Countertops - Turn Key'),
(72,'Home Construction','Flooring'),(73,'Home Construction','Tile'),
(74,'Home Construction','Mirrors & Shower Glass'),(75,'Home Construction','Appliances'),
(76,'Home Construction','Smart Home/Low Voltage'),(77,'Home Construction','HVAC - Rough'),
(78,'Home Construction','HVAC - Final'),(79,'Home Construction','Electrical - Rough'),
(80,'Home Construction','Electrical - Fixtures'),(81,'Home Construction','Electrical - Final'),
(82,'Home Construction','Plumbing - Ground'),(83,'Home Construction','Plumbing - Top Out'),
(84,'Home Construction','Plumbing - Final'),(85,'Home Construction','Septic System'),
(86,'Home Construction','Concrete - Flatwork'),(87,'Home Construction','Landscaping'),
(88,'Home Construction','Gutters & Downspouts'),(89,'Home Construction','Clean Up - Frame'),
(90,'Home Construction','Clean Up - Sheetrock'),(91,'Home Construction','Clean Up - Brick'),
(92,'Home Construction','Clean Up - Trim'),(93,'Home Construction','Clean Up - Paint & Tile'),
(94,'Home Construction','Clean Up - Final (Construction)'),(95,'Home Construction','Clean Up - Final (Move-In)'),
(96,'Home Construction','Operating - Portable Toilet'),(97,'Home Construction','Operating - Dumpsters'),
(98,'Home Construction','Operating - Electrical Temporary'),(99,'Home Construction','Operating - Water Temporary'),
(100,'Home Construction','Survey - Final / As-Built'),(101,'Home Construction','Warranty Reserve'),
(102,'Home Construction','Miscellaneous')
on conflict (code) do nothing;

-- ── cost_items: add int cost_code FK if missing ──
alter table cost_items add column if not exists cost_code integer references cost_codes(code);

-- ── build_stages ──
create table if not exists build_stages (
  stage_number integer primary key,
  name text not null
);
alter table build_stages enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'build_stages' and policyname = 'Public read build stages'
  ) then
    create policy "Public read build stages" on build_stages for select using (true);
  end if;
end $$;
insert into build_stages (stage_number, name) values
(1,'Lot prep and layout'),(2,'Pad grading'),(3,'Temp utilities & site setup'),
(4,'Foundation - Set forms & Trench'),(5,'Plumbing - Underground'),(6,'Electrical - Underground (ENT)'),
(7,'Foundation (cables/rebar)'),(8,'Pour slab'),(9,'Construction Clean - 1/7 - Forms'),
(10,'Rough grade'),(11,'Framing – walls & trusses'),(12,'Sheathing – walls and roof'),
(13,'Weather barrier (WRB)'),(14,'Windows and exterior doors'),(15,'Water Well Install'),
(16,'Plumbing - Top‑Out'),(17,'HVAC - Rough'),(18,'Roofing'),(19,'Electrical - Rough'),
(20,'Construction Clean - 2/7 - Frame'),(21,'Siding – exterior cladding'),(22,'Insulation'),
(23,'Drywall – hang, tape, texture'),(24,'Construction Clean - 3/7 - Drywall'),
(25,'Garage door - Rough (door and tracks)'),(26,'Paint - Exterior'),(27,'Masonry/brick/stone'),
(28,'Construction Clean - 4/7 - Brick'),(29,'Septic system rough in'),(30,'Interior doors & trim'),
(31,'Cabinets'),(32,'Construction Clean - 5/7 - Trim'),(33,'Paint - interior'),(34,'Countertops'),
(35,'Fireplace'),(36,'Construction Clean - 6/7 - Paint & Tile'),(37,'Flatwork – driveway, walks, patios'),
(38,'Flooring Install'),(39,'Tile'),(40,'Electrical - Final'),(41,'Plumbing - Final'),
(42,'HVAC - Final'),(43,'Hardware'),(44,'Garage door - Final (operator/opener)'),(45,'Appliances'),
(46,'Mirrors/Glass'),(47,'Paint - interior finish & touch‑ups'),(48,'Gutter install'),
(49,'Final grade'),(50,'Landscape/irrigation'),(51,'Construction Clean - 7/7 - Final'),
(52,'Punch list & touch‑ups'),(53,'Final Clean'),(54,'Final inspections & utility releases')
on conflict (stage_number) do nothing;

-- ── project_stages ──
create table if not exists project_stages (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  stage_number integer references build_stages(stage_number) not null,
  status text not null default 'not_started',
  planned_start date, planned_end date, actual_start date, actual_end date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, stage_number)
);
alter table project_stages enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'project_stages' and policyname = 'Users access project_stages via projects'
  ) then
    create policy "Users access project_stages via projects" on project_stages
      for all using (
        exists (select 1 from projects where projects.id = project_stages.project_id and projects.user_id = auth.uid())
      );
  end if;
end $$;

-- ── stage_photos ──
create table if not exists stage_photos (
  id uuid primary key default uuid_generate_v4(),
  project_stage_id uuid references project_stages(id) on delete cascade not null,
  file_url text not null, caption text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);
alter table stage_photos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'stage_photos' and policyname = 'Users access stage_photos via project_stages') then
    create policy "Users access stage_photos via project_stages" on stage_photos for all using (
      exists (select 1 from project_stages ps join projects p on p.id = ps.project_id
              where ps.id = stage_photos.project_stage_id and p.user_id = auth.uid())
    );
  end if;
end $$;

-- ── stage_documents ──
create table if not exists stage_documents (
  id uuid primary key default uuid_generate_v4(),
  project_stage_id uuid references project_stages(id) on delete cascade not null,
  file_url text not null, document_type text not null default 'other', name text not null,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);
alter table stage_documents enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'stage_documents' and policyname = 'Users access stage_documents via project_stages') then
    create policy "Users access stage_documents via project_stages" on stage_documents for all using (
      exists (select 1 from project_stages ps join projects p on p.id = ps.project_id
              where ps.id = stage_documents.project_stage_id and p.user_id = auth.uid())
    );
  end if;
end $$;

-- ── project_budget ──
create table if not exists project_budget (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  cost_code integer references cost_codes(code) not null,
  budgeted_amount numeric(15,2) not null default 0,
  committed_amount numeric(15,2) not null default 0,
  actual_amount numeric(15,2) not null default 0,
  unique (project_id, cost_code)
);
alter table project_budget enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'project_budget' and policyname = 'Users access project_budget via projects') then
    create policy "Users access project_budget via projects" on project_budget for all using (
      exists (select 1 from projects where projects.id = project_budget.project_id and projects.user_id = auth.uid())
    );
  end if;
end $$;

-- ── vendors ──
create table if not exists vendors (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null, type text not null default 'subcontractor',
  contact_name text, phone text, email text, address text,
  w9_on_file boolean not null default false,
  coi_expiry date, license_number text, license_expiry date, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table vendors enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'vendors' and policyname = 'Users own vendors') then
    create policy "Users own vendors" on vendors for all using (auth.uid() = user_id);
  end if;
end $$;

-- ── vendor_documents ──
create table if not exists vendor_documents (
  id uuid primary key default uuid_generate_v4(),
  vendor_id uuid references vendors(id) on delete cascade not null,
  document_type text not null default 'other',
  file_url text not null, expiry_date date,
  uploaded_at timestamptz not null default now()
);
alter table vendor_documents enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'vendor_documents' and policyname = 'Users access vendor_documents via vendors') then
    create policy "Users access vendor_documents via vendors" on vendor_documents for all using (
      exists (select 1 from vendors where vendors.id = vendor_documents.vendor_id and vendors.user_id = auth.uid())
    );
  end if;
end $$;

-- ── purchase_orders ──
create table if not exists purchase_orders (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  vendor_id uuid references vendors(id) on delete set null,
  cost_code integer references cost_codes(code),
  po_number text not null, description text not null,
  amount numeric(15,2) not null default 0,
  status text not null default 'draft', issued_date date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table purchase_orders enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'purchase_orders' and policyname = 'Users access purchase_orders via projects') then
    create policy "Users access purchase_orders via projects" on purchase_orders for all using (
      exists (select 1 from projects where projects.id = purchase_orders.project_id and projects.user_id = auth.uid())
    );
  end if;
end $$;

-- ── contracts ──
create table if not exists contracts (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  vendor_id uuid references vendors(id) on delete set null,
  cost_code integer references cost_codes(code),
  po_id uuid references purchase_orders(id) on delete set null,
  description text not null,
  contract_amount numeric(15,2) not null default 0,
  status text not null default 'draft', signed_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table contracts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contracts' and policyname = 'Users access contracts via projects') then
    create policy "Users access contracts via projects" on contracts for all using (
      exists (select 1 from projects where projects.id = contracts.project_id and projects.user_id = auth.uid())
    );
  end if;
end $$;

-- ── change_orders ──
create table if not exists change_orders (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid references contracts(id) on delete cascade not null,
  description text not null,
  amount numeric(15,2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table change_orders enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'change_orders' and policyname = 'Users access change_orders via contracts') then
    create policy "Users access change_orders via contracts" on change_orders for all using (
      exists (
        select 1 from contracts c join projects p on p.id = c.project_id
        where c.id = change_orders.contract_id and p.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- ── invoices: add missing columns ──
alter table invoices
  add column if not exists vendor_id uuid references vendors(id) on delete set null,
  add column if not exists po_id uuid references purchase_orders(id) on delete set null,
  add column if not exists contract_id uuid references contracts(id) on delete set null,
  add column if not exists cost_code integer references cost_codes(code),
  add column if not exists amount numeric(15,2),
  add column if not exists status text not null default 'pending_review',
  add column if not exists due_date date,
  add column if not exists payment_date date,
  add column if not exists payment_method text,
  add column if not exists ai_confidence text,
  add column if not exists ai_notes text,
  add column if not exists source text not null default 'upload';

update invoices set amount = total_amount where amount is null and total_amount is not null;

-- ── invoice_files ──
create table if not exists invoice_files (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid references invoices(id) on delete cascade not null,
  file_url text not null, file_type text not null default 'pdf',
  uploaded_at timestamptz not null default now()
);
alter table invoice_files enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'invoice_files' and policyname = 'Users access invoice_files via invoices') then
    create policy "Users access invoice_files via invoices" on invoice_files for all using (
      exists (
        select 1 from invoices iv join projects p on p.id = iv.project_id
        where iv.id = invoice_files.invoice_id and p.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- ── loans ──
create table if not exists loans (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade not null,
  lender_id uuid references contacts(id) on delete set null,
  loan_number text, loan_type text not null default 'construction',
  total_amount numeric(15,2) not null default 0,
  interest_rate numeric(8,6) not null default 0,
  rate_type text not null default 'fixed',
  origination_date date, maturity_date date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table loans enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'loans' and policyname = 'Users access loans via projects') then
    create policy "Users access loans via projects" on loans for all using (
      exists (select 1 from projects where projects.id = loans.project_id and projects.user_id = auth.uid())
    );
  end if;
end $$;

-- ── loan_draws ──
create table if not exists loan_draws (
  id uuid primary key default uuid_generate_v4(),
  loan_id uuid references loans(id) on delete cascade not null,
  draw_number integer not null,
  amount_requested numeric(15,2) not null default 0,
  amount_approved numeric(15,2),
  status text not null default 'draft',
  submitted_date date, funded_date date, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table loan_draws enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'loan_draws' and policyname = 'Users access loan_draws via loans') then
    create policy "Users access loan_draws via loans" on loan_draws for all using (
      exists (
        select 1 from loans l join projects p on p.id = l.project_id
        where l.id = loan_draws.loan_id and p.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- ── loan_draw_items ──
create table if not exists loan_draw_items (
  id uuid primary key default uuid_generate_v4(),
  draw_id uuid references loan_draws(id) on delete cascade not null,
  cost_code integer references cost_codes(code),
  invoice_id uuid references invoices(id) on delete set null,
  description text not null,
  amount numeric(15,2) not null default 0
);
alter table loan_draw_items enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'loan_draw_items' and policyname = 'Users access loan_draw_items via loan_draws') then
    create policy "Users access loan_draw_items via loan_draws" on loan_draw_items for all using (
      exists (
        select 1 from loan_draws ld join loans l on l.id = ld.loan_id join projects p on p.id = l.project_id
        where ld.id = loan_draw_items.draw_id and p.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- ── loan_payments ──
create table if not exists loan_payments (
  id uuid primary key default uuid_generate_v4(),
  loan_id uuid references loans(id) on delete cascade not null,
  payment_date date not null,
  payment_type text not null default 'interest',
  amount numeric(15,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
alter table loan_payments enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'loan_payments' and policyname = 'Users access loan_payments via loans') then
    create policy "Users access loan_payments via loans" on loan_payments for all using (
      exists (
        select 1 from loans l join projects p on p.id = l.project_id
        where l.id = loan_payments.loan_id and p.user_id = auth.uid()
      )
    );
  end if;
end $$;

-- ── Storage buckets ──
insert into storage.buckets (id, name, public) values
  ('stage-photos', 'stage-photos', true),
  ('stage-docs', 'stage-docs', false),
  ('vendor-docs', 'vendor-docs', false),
  ('invoices', 'invoices', false)
on conflict (id) do nothing;
