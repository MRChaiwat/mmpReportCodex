create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'executive', 'manager', 'sales', 'product_manager', 'finance')),
  status text not null check (status in ('pending', 'approved', 'rejected', 'disabled')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists role_scopes (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  scope_type text not null check (scope_type in ('area', 'sales', 'product_group')),
  scope_value text not null
);

create table if not exists imports (
  id text primary key,
  uploaded_by text references users(id),
  file_name text not null,
  blob_url text,
  sheet_name text,
  row_count integer not null default 0,
  status text not null check (status in ('processing', 'completed', 'failed')),
  error_message text,
  dashboard_json jsonb,
  imported_at timestamptz not null default now()
);

create table if not exists budget_facts (
  id text primary key,
  import_id text not null references imports(id) on delete cascade,
  area text not null,
  salename text not null,
  product_group text not null,
  customer_name text not null,
  month text not null,
  type text not null,
  amount numeric not null default 0,
  qty numeric not null default 0,
  kg numeric not null default 0,
  row_count integer not null default 0
);

create table if not exists data_quality_issues (
  id text primary key,
  import_id text not null references imports(id) on delete cascade,
  issue_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  issue_count integer not null default 0,
  sample_value text
);

create index if not exists idx_sessions_token on sessions(token_hash);
create index if not exists idx_sessions_expires on sessions(expires_at);
create index if not exists idx_imports_status_time on imports(status, imported_at desc);
create index if not exists idx_facts_import on budget_facts(import_id);
create index if not exists idx_facts_scope on budget_facts(import_id, area, salename, product_group);
create index if not exists idx_scopes_user on role_scopes(user_id);
