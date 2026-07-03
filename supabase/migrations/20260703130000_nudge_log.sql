-- Nudge 발송 이력 + 쿨다운.
--
-- 문제: 수동 넛지(POST /api/admin/nudge)에 재발송 제한이 없어 같은 챔피언에게
-- 반복 발송(스팸) 가능(PRD R4). 발송 이력이 없어 쿨다운을 걸 수 없었다.
--
-- nudge_log 에 모든 넛지(수동/크론)를 기록하고, 쿨다운 창(기본 20시간) 내
-- 같은 (user, type) 재발송을 차단한다.

CREATE TABLE IF NOT EXISTS nudge_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nudge_type  TEXT NOT NULL CHECK (nudge_type IN ('no_charter', 'no_milestone', 'delayed_milestone')),
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'cron')),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 쿨다운 조회: 특정 (user, type) 의 최근 발송을 빠르게 찾기 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_nudge_log_user_type_sent
  ON nudge_log (user_id, nudge_type, sent_at DESC);

-- API 는 service role 로 접근(RLS 우회). 챔피언 직접 접근은 없음.
ALTER TABLE nudge_log ENABLE ROW LEVEL SECURITY;
