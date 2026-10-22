-- 처리 실패 원인 코드 컬럼 (check_up_sessions)
-- 목적: 1:1 노트 처리(STT/요약)가 실패한 이유를 짧은 코드(stt_quota 등)로 기록해 UI가 원인을 안내하게 한다.
-- 적용: prod Supabase에는 수동으로 적용한다.
-- 멱등: ADD COLUMN IF NOT EXISTS 이므로 여러 번 실행해도 안전하다.
-- 안전: 컬럼이 아직 없어도 코드는 안전하다(별도 best-effort UPDATE라 실패해도 처리 상태에 영향 없음).

ALTER TABLE check_up_sessions
  ADD COLUMN IF NOT EXISTS processing_error TEXT;
