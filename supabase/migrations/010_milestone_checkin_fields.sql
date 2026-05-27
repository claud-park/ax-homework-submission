alter table milestones
  add column if not exists is_manual_completed boolean not null default false,
  add column if not exists bottleneck_type text check (bottleneck_type in ('technical', 'resource', 'external', 'other')),
  add column if not exists bottleneck_note text;
