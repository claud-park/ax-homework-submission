-- Link charter_submissions and milestones to a specific homework
alter table charter_submissions
  add column if not exists homework_id integer references homeworks(id) on delete set null;

alter table milestones
  add column if not exists homework_id integer references homeworks(id) on delete set null;

-- Partial unique index: each user can have at most one charter per homework
create unique index if not exists charter_submissions_user_homework_unique
  on charter_submissions(user_id, homework_id)
  where homework_id is not null;
