-- homeworks.created_by referenced the custom users table (champions only).
-- Admins exist only in auth.users, so their inserts violated the FK.
-- Re-point the constraint to auth.users so any authenticated user (admin or champion)
-- can author a homework draft/publish.
-- Same pattern as migration 007 (charter_comments).

alter table homeworks
  drop constraint if exists homeworks_created_by_fkey;

alter table homeworks
  add constraint homeworks_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
