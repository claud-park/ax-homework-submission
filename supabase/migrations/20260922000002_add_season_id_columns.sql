-- supabase/migrations/20260922000002_add_season_id_columns.sql
-- 시즌 스코프 테이블에 season_id를 nullable로 추가한다.
-- NOT NULL 전환과 인덱스 생성은 백필 이후 20260922000003에서 수행한다.

ALTER TABLE charter_submissions ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE project_charters ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE milestones ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE check_up_sessions ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE champion_weekly_sessions ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE session_action_items ADD COLUMN season_id UUID REFERENCES seasons(id);

-- 시즌을 이어가는 챔피언의 새 차터가 직전 시즌 차터를 참조용으로 연결
ALTER TABLE project_charters ADD COLUMN previous_charter_id UUID REFERENCES project_charters(id);
