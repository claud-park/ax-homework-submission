CREATE TABLE champion_google_tokens (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email          text        NOT NULL,
  access_token   text        NOT NULL,
  refresh_token  text        NOT NULL,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE champion_google_tokens ENABLE ROW LEVEL SECURITY;

-- 본인 토큰만 조회 가능 (삽입/수정은 service role만)
CREATE POLICY "own_token_select" ON champion_google_tokens
  FOR SELECT USING (auth.uid() = user_id);
