-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type submission_status as enum ('pending', 'accepted', 'declined');
create type milestone_status as enum ('not_started', 'in_progress', 'completed', 'delayed');
create type request_status as enum ('pending', 'approved', 'rejected');

-- ============================================================
-- TABLES
-- ============================================================

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table homeworks (
  id serial primary key,
  title text not null,
  description text,
  due_date date not null,
  created_at timestamptz not null default now()
);

create table submissions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  homework_id int not null references homeworks(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  status submission_status not null default 'pending',
  attempt_number int not null default 1,
  submitted_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default uuid_generate_v4(),
  submission_id uuid not null references submissions(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table project_charters (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references users(id) on delete cascade,
  project_name text,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  week_number int not null,
  title text not null,
  description text,
  start_date date not null,
  due_date date not null,
  status milestone_status not null default 'not_started',
  is_manual_progress boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table milestone_deliverables (
  id uuid primary key default uuid_generate_v4(),
  milestone_id uuid not null references milestones(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

create table deadline_change_requests (
  id uuid primary key default uuid_generate_v4(),
  milestone_id uuid not null references milestones(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  original_due_date date not null,
  requested_due_date date not null,
  reason text not null,
  status request_status not null default 'pending',
  reviewed_by uuid references users(id),
  support_assignee uuid references users(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS — DENY ALL (service key bypasses RLS)
-- ============================================================
alter table users enable row level security;
alter table homeworks enable row level security;
alter table submissions enable row level security;
alter table comments enable row level security;
alter table project_charters enable row level security;
alter table milestones enable row level security;
alter table milestone_deliverables enable row level security;
alter table deadline_change_requests enable row level security;
-- No policies created: all direct client access denied

-- ============================================================
-- STORAGE BUCKETS (run in Supabase dashboard or via API)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('submissions', 'submissions', false);
-- insert into storage.buckets (id, name, public) values ('milestone-deliverables', 'milestone-deliverables', false);
-- Storage RLS: deny all policies (no policies = deny by default for private buckets)
