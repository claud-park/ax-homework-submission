-- supabase/migrations/022_hotline_attachments.sql

-- hotline_attachments table
CREATE TABLE hotline_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES hotline_messages(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   BIGINT NOT NULL,
  mime_type   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hotline_attachments_message_id ON hotline_attachments(message_id);

ALTER TABLE hotline_attachments ENABLE ROW LEVEL SECURITY;

-- Champions can only see attachments on their own messages
CREATE POLICY "champion_read_own_attachments" ON hotline_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM hotline_messages
      WHERE id = message_id AND champion_user_id = auth.uid()
    )
  );

-- Admins can see all attachments
CREATE POLICY "admin_read_all_attachments" ON hotline_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- Create storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('hotline', 'hotline', false)
ON CONFLICT (id) DO NOTHING;
