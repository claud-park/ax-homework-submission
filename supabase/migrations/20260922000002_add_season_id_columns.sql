-- supabase/migrations/20260922000002_add_season_id_columns.sql
-- 시즌 스코프 테이블에 season_id를 nullable로 추가한다.
-- NOT NULL 전환과 인덱스 생성은 백필 이후 20260922000003에서 수행한다.
--
-- project_charters는 실제 운영 DB에 존재하지 않는 테이블로 확인되어(app/api/charter/route.ts만
-- 참조하는 죽은 코드 — 프론트엔드에서 호출하는 곳이 없음) 이 마이그레이션 범위에서 제외한다.
-- 시즌을 이어가는 챔피언의 차터 연결은 실제로 쓰이는 charter_submissions에 건다.

ALTER TABLE charter_submissions ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE milestones ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE check_up_sessions ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE champion_weekly_sessions ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE session_action_items ADD COLUMN season_id UUID REFERENCES seasons(id);

-- 시즌을 이어가는 챔피언의 새 차터가 직전 시즌 차터를 참조용으로 연결
ALTER TABLE charter_submissions ADD COLUMN previous_charter_id UUID REFERENCES charter_submissions(id);
