-- supabase/migrations/20260623000000_check_up_sessions.sql

-- 1. check_up_sessions
CREATE TABLE check_up_sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_date            DATE NOT NULL,
  title                   TEXT NOT NULL,
  notes                   TEXT,
  audio_file_path         TEXT,
  recording_duration_sec  INT,
  processing_status       TEXT NOT NULL DEFAULT 'idle'
                            CHECK (processing_status IN ('idle','uploading','transcribing','summarizing','done','error')),
  raw_transcript          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkup_champion ON check_up_sessions(champion_user_id, session_date DESC);

ALTER TABLE check_up_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkup_champion_own" ON check_up_sessions
  FOR SELECT USING (auth.uid() = champion_user_id);

CREATE POLICY "checkup_admin_all" ON check_up_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- 2. session_action_items
CREATE TABLE session_action_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES check_up_sessions(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  is_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_items_session ON session_action_items(session_id, display_order);

ALTER TABLE session_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_items_champion_read" ON session_action_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM check_up_sessions
      WHERE id = session_id AND champion_user_id = auth.uid()
    )
  );

CREATE POLICY "action_items_champion_toggle" ON session_action_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM check_up_sessions
      WHERE id = session_id AND champion_user_id = auth.uid()
    )
  )
  WITH CHECK (true);

CREATE POLICY "action_items_admin_all" ON session_action_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- 3. session_comments
CREATE TABLE session_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES check_up_sessions(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  author_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('admin','champion')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_comments_session ON session_comments(session_id, created_at);

ALTER TABLE session_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_comments_champion_read" ON session_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM check_up_sessions
      WHERE id = session_id AND champion_user_id = auth.uid()
    )
  );

CREATE POLICY "session_comments_champion_own" ON session_comments
  FOR ALL USING (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM check_up_sessions
      WHERE id = session_id AND champion_user_id = auth.uid()
    )
  );

CREATE POLICY "session_comments_admin_all" ON session_comments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- 4. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('check-up-sessions', 'check-up-sessions', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "checkup_audio_admin_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'check-up-sessions'
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );
