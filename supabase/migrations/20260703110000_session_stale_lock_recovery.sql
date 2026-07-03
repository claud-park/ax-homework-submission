-- 세션 처리 락의 stale 복구.
--
-- 문제: claimSessionForProcessing 은 processing_status 가 in-flight(uploading/
-- transcribing/summarizing)가 아닐 때만 클레임을 허용한다. 처리 함수가 도중에
-- 중단(예: maxDuration 초과로 킬)되면 status 가 in-flight 로 남아 이후 모든
-- 처리 시도가 영구히 409(이미 처리 중)로 실패한다. TTL 이 없어 self-heal 불가.
--
-- 해결: 처리 시작 시각(processing_started_at)을 기록하고, in-flight 라도
-- 시작이 stale(기본 6분 = maxDuration 300s + 버퍼) 이면 재클레임을 허용한다.
-- 원자성을 위해 단일 UPDATE 를 수행하는 RPC 로 구현한다.

ALTER TABLE check_up_sessions ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION claim_session_for_processing(
  p_session_id UUID,
  p_stale_seconds INT DEFAULT 360
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE check_up_sessions
  SET processing_status = 'transcribing',
      processing_started_at = now()
  WHERE id = p_session_id
    AND (
      processing_status NOT IN ('uploading', 'transcribing', 'summarizing')
      OR COALESCE(processing_started_at, 'epoch'::timestamptz) < now() - make_interval(secs => p_stale_seconds)
    );
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;
