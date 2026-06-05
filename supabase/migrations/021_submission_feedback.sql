-- supabase/migrations/021_submission_feedback.sql
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS feedback text,
  ADD COLUMN IF NOT EXISTS feedback_updated_at timestamptz;
