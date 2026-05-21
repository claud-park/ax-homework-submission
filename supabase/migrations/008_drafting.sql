-- 008_drafting.sql — Add draft/published lifecycle to homeworks, charter_submissions, milestones
-- Spec: docs/superpowers/specs/2026-05-19-drafting-feature-design.md

create type publish_status as enum ('draft', 'published');

alter table homeworks
  add column publish_status publish_status not null default 'published',
  add column created_by uuid references users(id);

alter table charter_submissions
  add column publish_status publish_status not null default 'published';

alter table milestones
  add column publish_status publish_status not null default 'published';

create index homeworks_drafts_by_author
  on homeworks(created_by) where publish_status = 'draft';
create index charter_submissions_drafts_by_user
  on charter_submissions(user_id) where publish_status = 'draft';
create index milestones_drafts_by_user
  on milestones(user_id) where publish_status = 'draft';

-- Rollback (manual):
--   alter table homeworks drop column publish_status, drop column created_by;
--   alter table charter_submissions drop column publish_status;
--   alter table milestones drop column publish_status;
--   drop type publish_status;
