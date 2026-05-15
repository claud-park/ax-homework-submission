-- author_id and resolved_by referenced the custom users table (champions only).
-- Admins exist only in auth.users, so their inserts violated the FK.
-- Re-point both constraints to auth.users so any authenticated user can author comments.

alter table charter_comments
  drop constraint if exists charter_comments_author_id_fkey;

alter table charter_comments
  drop constraint if exists charter_comments_resolved_by_fkey;

alter table charter_comments
  add constraint charter_comments_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;

alter table charter_comments
  add constraint charter_comments_resolved_by_fkey
  foreign key (resolved_by) references auth.users(id) on delete set null;
