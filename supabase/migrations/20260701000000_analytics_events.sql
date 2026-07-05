-- 핵심 전환 이벤트(P0 퍼널 + milestone_issue_reported) dual-write 대상 테이블.
-- Mixpanel 과 병행 적재해 우리가 소유해야 할 비즈니스 이벤트를 DB 에도 남긴다.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_idx
  ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx
  ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON public.analytics_events(created_at);

COMMENT ON TABLE public.analytics_events IS
  '핵심 전환 이벤트 dual-write. insert 는 API route(service key) 경유. 나머지 이벤트는 Mixpanel 전용.';

-- RLS: 클라이언트 직접 접근 차단. 적재는 service key(API route), 조회는 서버 admin 경로에서만.
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
