-- supabase/migrations/20260922000003_backfill_season_one.sql
-- 1기는 이미 마무리된 상태이므로 status='closed'로 백필한다.
-- 시즌2가 아직 없으므로 is_current=true로 남겨 기존 화면 동작을 보존한다.
-- 이탈/중도포기를 나타내는 기존 필드가 없으므로 전원 completed로 간주한다.

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
  UPDATE project_charters SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE milestones SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE check_up_sessions SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE champion_weekly_sessions SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE session_action_items SET season_id = v_season_id WHERE season_id IS NULL;
END $$;

ALTER TABLE charter_submissions ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE project_charters ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE milestones ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE check_up_sessions ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE champion_weekly_sessions ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE session_action_items ALTER COLUMN season_id SET NOT NULL;

CREATE INDEX charter_submissions_season_user_idx ON charter_submissions(season_id, user_id);
CREATE INDEX project_charters_season_user_idx ON project_charters(season_id, user_id);
CREATE INDEX milestones_season_user_idx ON milestones(season_id, user_id);
CREATE INDEX check_up_sessions_season_champion_idx ON check_up_sessions(season_id, champion_user_id);
CREATE INDEX champion_weekly_sessions_season_idx ON champion_weekly_sessions(season_id);
CREATE INDEX session_action_items_season_idx ON session_action_items(season_id);
