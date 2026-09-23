-- supabase/migrations/20260923000000_add_viewer_role.sql
-- 일반 사원 뷰어 권한 도입.
-- 1) users.user_group에 'viewer' 추가, 신규 가입 기본값을 champion에서 viewer로 변경
--    (기존 champion/partner 사용자 데이터는 그대로 유지 — DEFAULT 변경은 이후 신규 가입자에게만 적용)
-- 2) charter_submissions에 공개 플래그 추가 (기본 false — 관리자가 명시적으로 켜야 노출)

BEGIN;

-- 제약명이 기본값에서 달라졌을 수 있으므로 이름을 추측하지 않고 실제 정의를 찾아 드롭한다.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.users'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%user_group%'
  LOOP EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE public.users ADD CONSTRAINT users_user_group_check
  CHECK (user_group IN ('champion', 'partner', 'viewer'));
ALTER TABLE public.users ALTER COLUMN user_group SET DEFAULT 'viewer';

ALTER TABLE charter_submissions ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

COMMIT;
