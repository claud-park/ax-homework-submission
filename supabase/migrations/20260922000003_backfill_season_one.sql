-- supabase/migrations/20260922000003_backfill_season_one.sql
-- 1기는 이미 마무리된 상태이므로 status='closed'로 백필한다.
-- 시즌2가 아직 없으므로 is_current=true로 남겨 기존 화면 동작을 보존한다.
-- 이탈/중도포기를 나타내는 기존 필드가 없으므로 전원 completed로 간주한다.
--
-- season_id를 NOT NULL로 확정하는 작업은 20260922000004로 분리했다 —
-- 애플리케이션 코드가 신규 INSERT에서 season_id를 채우게 된 뒤에만 적용해야
-- 기존 쓰기 경로가 깨지지 않는다.

BEGIN;

DO $$
DECLARE
  v_season_id UUID;
BEGIN
  INSERT INTO seasons (name, status, is_current, start_date)
  VALUES ('시즌 1', 'closed', true, (SELECT MIN(created_at)::date FROM users))
  RETURNING id INTO v_season_id;

  INSERT INTO season_enrollments (season_id, user_id, role_in_season, status)
  SELECT v_season_id, id, user_group, 'completed'
  FROM users
  WHERE user_group IN ('champion', 'partner');

  UPDATE charter_submissions SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE milestones SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE check_up_sessions SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE champion_weekly_sessions SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE session_action_items SET season_id = v_season_id WHERE season_id IS NULL;
END $$;

COMMIT;
