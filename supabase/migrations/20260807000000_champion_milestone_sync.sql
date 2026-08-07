-- 20260807000000_champion_milestone_sync.sql
-- 챔피언 마일스톤 동기화 스킬: 페어링 코드 / 개인 액세스 토큰 / 마일스톤 작업 로그

CREATE TABLE device_pairing_codes (
  code text PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'expired')),
  issued_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE personal_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users,
  token_hash text NOT NULL UNIQUE,
  label text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX personal_access_tokens_user_id_idx ON personal_access_tokens(user_id) WHERE revoked_at IS NULL;

CREATE TABLE milestone_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES milestones ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX milestone_activity_log_milestone_id_idx ON milestone_activity_log(milestone_id);

COMMENT ON TABLE device_pairing_codes IS '로컬 Claude Code 스킬 페어링용 단명 코드 (TTL ~10분)';
COMMENT ON TABLE personal_access_tokens IS '챔피언별 장기 API 토큰 (해시만 저장, 평문은 발급 시 1회만 노출)';
COMMENT ON TABLE milestone_activity_log IS '챔피언 마일스톤 동기화 스킬이 남기는 날짜별 작업 로그';
