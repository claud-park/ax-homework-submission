-- supabase/migrations/020_hotline_sender_id_fk.sql
-- sender_id FK를 public.users → auth.users 로 변경
-- admin 유저는 auth.users에는 존재하지만 public.users에는 없을 수 있어서 INSERT 500 오류 발생

ALTER TABLE hotline_messages
  DROP CONSTRAINT IF EXISTS hotline_messages_sender_id_fkey;

ALTER TABLE hotline_messages
  ADD CONSTRAINT hotline_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
