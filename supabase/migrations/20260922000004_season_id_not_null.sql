-- supabase/migrations/20260922000004_season_id_not_null.sql
-- season_id를 NOT NULL로 확정 + 인덱스 생성.
--
-- 반드시 애플리케이션 코드(신규 INSERT에서 season_id를 채우는 코드)가 배포된
-- 뒤에 적용한다 — 순서를 어기면 배포 직후 신규 쓰기가 NOT NULL 위반으로 실패한다.

BEGIN;

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

COMMIT;
