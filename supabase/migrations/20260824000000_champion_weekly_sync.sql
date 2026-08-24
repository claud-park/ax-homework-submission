-- supabase/migrations/20260824000000_champion_weekly_sync.sql

-- 1. champion_weekly_sessions
CREATE TABLE champion_weekly_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date  DATE NOT NULL,
  session_time  TIME,
  title         TEXT NOT NULL,
  notes         TEXT,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weekly_sessions_date ON champion_weekly_sessions(session_date DESC);

ALTER TABLE champion_weekly_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_sessions_admin_all" ON champion_weekly_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );

-- 2. weekly_champion_updates
CREATE TABLE weekly_champion_updates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_session_id UUID NOT NULL REFERENCES champion_weekly_sessions(id) ON DELETE CASCADE,
  champion_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_label     TEXT,
  summary           TEXT NOT NULL,
  display_order     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weekly_updates_session ON weekly_champion_updates(weekly_session_id, display_order);
CREATE INDEX idx_weekly_updates_champion ON weekly_champion_updates(champion_user_id, created_at DESC);

ALTER TABLE weekly_champion_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_updates_admin_all" ON weekly_champion_updates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );
