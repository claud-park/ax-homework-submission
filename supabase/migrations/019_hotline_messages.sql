-- supabase/migrations/019_hotline_messages.sql

CREATE TABLE hotline_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role      TEXT NOT NULL CHECK (sender_role IN ('champion', 'admin')),
  body             TEXT NOT NULL CHECK (char_length(body) > 0),
  read_by_champion BOOLEAN NOT NULL DEFAULT FALSE,
  read_by_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hotline_champion_created
  ON hotline_messages(champion_user_id, created_at);

ALTER TABLE hotline_messages ENABLE ROW LEVEL SECURITY;

-- champion: 자신의 스레드만 접근 가능
CREATE POLICY "hotline_champion_own" ON hotline_messages
  FOR ALL
  USING (auth.uid() = champion_user_id);

-- admin: 모든 스레드 접근 가능
CREATE POLICY "hotline_admin_all" ON hotline_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE hotline_messages;
