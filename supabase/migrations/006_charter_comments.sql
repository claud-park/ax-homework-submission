create table if not exists charter_comments (
  id                    uuid primary key default gen_random_uuid(),
  charter_submission_id uuid not null references charter_submissions(id) on delete cascade,
  parent_id             uuid references charter_comments(id) on delete cascade,
  body                  text not null,
  author_role           text not null check (author_role in ('admin', 'user')),
  author_id             uuid references users(id) on delete set null,
  is_resolved           boolean not null default false,
  resolved_by           uuid references users(id) on delete set null,
  resolved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
