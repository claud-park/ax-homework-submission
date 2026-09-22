-- supabase/migrations/20260922000001_create_season_enrollments.sql
-- 사람×시즌×역할. users 테이블은 "이 사람이 누구인가"만 담당하고,
-- "이번 시즌에 champion/partner로 참여 중인가"는 이 테이블이 진실 소스가 된다.

CREATE TABLE season_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role_in_season TEXT NOT NULL CHECK (role_in_season IN ('champion', 'partner')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'dropped')),
  continued_from_enrollment_id UUID REFERENCES season_enrollments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);

CREATE INDEX season_enrollments_season_role_idx
  ON season_enrollments (season_id, role_in_season);

ALTER TABLE season_enrollments ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service key가 RLS를 우회
