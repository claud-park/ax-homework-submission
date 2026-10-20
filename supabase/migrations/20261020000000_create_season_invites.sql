-- supabase/migrations/20261020000000_create_season_invites.sql
-- 시즌 이메일 사전 등록. 로그인 전 사용자는 users 행이 없으므로 이메일을 키로 보관하고,
-- 첫 로그인(auth callback) 시 season_enrollments/users.user_group으로 변환한 뒤 consumed_at을 찍는다.
CREATE TABLE season_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id),
  email TEXT NOT NULL CHECK (email = lower(email)),
  role_in_season TEXT NOT NULL CHECK (role_in_season IN ('champion', 'partner')),
  consumed_at TIMESTAMPTZ,
  consumed_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, email)
);

CREATE INDEX season_invites_pending_email_idx ON season_invites (email) WHERE consumed_at IS NULL;

ALTER TABLE season_invites ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service key가 RLS를 우회 (season_enrollments와 동일)
