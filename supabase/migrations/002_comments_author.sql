-- Add author tracking and edit support to comments
alter table comments
  add column if not exists author_role text not null default 'admin'
    check (author_role in ('admin', 'user')),
  add column if not exists author_id uuid references users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
