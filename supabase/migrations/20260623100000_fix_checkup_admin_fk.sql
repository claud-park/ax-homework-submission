-- Fix: admin_user_id & session_comments.author_id should reference auth.users
-- (admin accounts may not exist in public.users table)

ALTER TABLE check_up_sessions
  DROP CONSTRAINT IF EXISTS check_up_sessions_admin_user_id_fkey;

ALTER TABLE check_up_sessions
  ALTER COLUMN admin_user_id DROP NOT NULL;

ALTER TABLE check_up_sessions
  ADD CONSTRAINT check_up_sessions_admin_user_id_fkey
  FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE session_comments
  DROP CONSTRAINT IF EXISTS session_comments_author_id_fkey;

ALTER TABLE session_comments
  ADD CONSTRAINT session_comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
