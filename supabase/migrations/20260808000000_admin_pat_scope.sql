-- 20260808000000_admin_pat_scope.sql
-- 어드민이 로컬에서 다른 챔피언의 1-on-1 세션 데이터를 읽고 쓸 수 있도록,
-- 기존 PAT(항상 non-admin)와 구분되는 관리자 스코프 PAT를 추가한다.

ALTER TABLE personal_access_tokens
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'champion' CHECK (scope IN ('champion', 'admin'));

ALTER TABLE device_pairing_codes
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'champion' CHECK (scope IN ('champion', 'admin'));

COMMENT ON COLUMN personal_access_tokens.scope IS '챔피언용(amst_, 절대 관리자 권한 없음) 또는 관리자용(admt_, is_admin=true로 해석됨)';
COMMENT ON COLUMN device_pairing_codes.scope IS '이 페어링 코드로 발급될 토큰의 scope — approve 시 admin이면 승인자가 실제 관리자인지 검증';
