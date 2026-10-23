-- 챔피언별 recap Slack 채널 ID 컬럼 (users)
-- 목적: 1:1 recap을 어드민+챔피언이 함께 있는 비공개 채널(recap 봇 초대 완료)로 보낸다.
--       Slack은 기존 DM에 봇을 추가할 수 없어, 그룹 DM을 비공개 채널로 전환한 뒤 그 채널 ID를 어드민 UI에서 입력한다.
-- 적용: prod Supabase SQL editor에서 수동으로 적용한다(코드 배포 후에 적용해도 된다).
-- 멱등: ADD COLUMN IF NOT EXISTS + 제약 존재 여부 확인이므로 여러 번 실행해도 안전하다.
-- 안전: 컬럼이 아직 없어도 코드는 동작한다(별도 best-effort 조회, 실패 시 미설정으로 간주하고 그룹 DM/1:1 DM으로 발송).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS recap_slack_channel_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_recap_slack_channel_id_format'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_recap_slack_channel_id_format
      CHECK (recap_slack_channel_id IS NULL OR recap_slack_channel_id ~ '^[CG][A-Z0-9]{8,}$');
  END IF;
END $$;
