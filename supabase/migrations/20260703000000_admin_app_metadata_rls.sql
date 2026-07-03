-- Admin RLS 정책을 raw_user_meta_data → raw_app_meta_data 로 이전.
--
-- 이유: user_metadata(raw_user_meta_data)는 로그인한 사용자 본인이 클라이언트
-- SDK(supabase.auth.updateUser)로 직접 수정할 수 있어 권한 상승에 악용될 수 있다.
-- app_metadata(raw_app_meta_data)는 서비스 롤(Admin API)로만 수정 가능하다.
--
-- 선행 조건: 이 마이그레이션 적용 전에 backfill 스크립트로 기존 admin 계정의
-- app_metadata.is_admin 이 세팅되어 있어야 한다. (scripts/backfill-admin-app-metadata.ts)
--
-- 기존 정책 정의(참조): 019_hotline_messages.sql, 022_hotline_attachments.sql,
-- 20260623000000_check_up_sessions.sql

-- 1. hotline_messages: hotline_admin_all
DROP POLICY IF EXISTS "hotline_admin_all" ON hotline_messages;
CREATE POLICY "hotline_admin_all" ON hotline_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );

-- 2. hotline_attachments: admin_read_all_attachments
DROP POLICY IF EXISTS "admin_read_all_attachments" ON hotline_attachments;
CREATE POLICY "admin_read_all_attachments" ON hotline_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );

-- 3. check_up_sessions: checkup_admin_all
DROP POLICY IF EXISTS "checkup_admin_all" ON check_up_sessions;
CREATE POLICY "checkup_admin_all" ON check_up_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );

-- 4. session_action_items: action_items_admin_all
DROP POLICY IF EXISTS "action_items_admin_all" ON session_action_items;
CREATE POLICY "action_items_admin_all" ON session_action_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );

-- 5. session_comments: session_comments_admin_all
DROP POLICY IF EXISTS "session_comments_admin_all" ON session_comments;
CREATE POLICY "session_comments_admin_all" ON session_comments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );

-- 6. storage.objects: checkup_audio_admin_all (check-up-sessions 버킷)
DROP POLICY IF EXISTS "checkup_audio_admin_all" ON storage.objects;
CREATE POLICY "checkup_audio_admin_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'check-up-sessions'
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );
