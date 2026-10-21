-- Slack recap 상태 컬럼 (check_up_sessions)
-- 목적: Admin 채널에 올린 recap 초안의 Slack 메시지 위치(channel/ts)와 챔피언 발송 이력을 기록한다.
-- 적용: prod Supabase에는 수동으로 적용한다. 코드 배포 "전에" 먼저 적용해야 한다.
-- 멱등: ADD COLUMN IF NOT EXISTS 이므로 여러 번 실행해도 안전하다.

ALTER TABLE check_up_sessions
  ADD COLUMN IF NOT EXISTS recap_slack_channel TEXT,
  ADD COLUMN IF NOT EXISTS recap_slack_ts TEXT,
  ADD COLUMN IF NOT EXISTS recap_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recap_sent_by TEXT;
