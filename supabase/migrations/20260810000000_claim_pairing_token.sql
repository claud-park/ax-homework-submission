-- poll 라우트의 issued_token 원자적 클레임 버그 수정.
--
-- 문제: update({ issued_token: null }).select('issued_token') 은 PostgREST의
-- UPDATE...RETURNING 이라 update 이후의 행 상태를 반환한다. 같은 요청 안에서
-- 방금 자신이 써넣은 NULL 을 다시 select 하므로 token 이 항상 null 이었다.
-- (동시 폴링 시 단 하나만 매치되는 원자성 자체는 .not('issued_token','is',null)
-- WHERE 조건 덕분에 정상 동작 — 반환값만 항상 null.)
--
-- 해결: 클레임 직전 값을 FOR UPDATE 로 잠근 뒤 반환하는 단일 RPC 로 위임한다.
-- (claim_session_for_processing 과 동일한 "단일 UPDATE RPC로 원자성 위임" 패턴.)

CREATE OR REPLACE FUNCTION claim_pairing_token(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT issued_token INTO v_token
  FROM device_pairing_codes
  WHERE code = p_code AND issued_token IS NOT NULL
  FOR UPDATE;

  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE device_pairing_codes
  SET issued_token = NULL
  WHERE code = p_code;

  RETURN v_token;
END;
$$;
