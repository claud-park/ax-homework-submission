-- 처리 비용(usage)을 세션에 저장한다.
--
-- 동기 처리에선 usage(STT/Claude 토큰·비용)가 응답 body로만 반환돼 클라이언트가
-- 즉시 표시했다. 백그라운드+폴링으로 전환하면 응답 body가 없으므로, 폴링 GET이
-- 비용을 읽을 수 있도록 DB에 저장한다.
-- 형태: { stt: {durationSec, cost}, claude: {inputTokens, outputTokens, cost}, totalCost }

ALTER TABLE check_up_sessions ADD COLUMN IF NOT EXISTS processing_usage JSONB;
