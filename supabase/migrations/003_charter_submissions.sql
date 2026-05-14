create table charter_submissions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  project_name text,
  content jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

alter table charter_submissions enable row level security;
