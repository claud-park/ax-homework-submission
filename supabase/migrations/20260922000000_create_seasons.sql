-- supabase/migrations/20260922000000_create_seasons.sql
-- 시즌(기수) 메타데이터. status는 시즌 자체의 진행 단계,
-- is_current는 "앱이 기본으로 보여주는 시즌"을 나타내며 서로 독립적이다.
-- 예: 시즌1이 closed여도 시즌2가 아직 없으면 is_current=true로 남는다.

CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recruiting'
    CHECK (status IN ('recruiting', 'active', 'closed', 'archived')),
  is_current BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동시에 하나의 시즌만 "현재 시즌"일 수 있다
CREATE UNIQUE INDEX seasons_single_current_idx
  ON seasons ((is_current)) WHERE is_current = true;

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service key가 RLS를 우회 (기존 sub_tasks/session_action_items 등과 동일한 패턴)
