-- supabase/migrations/011_milestone_bottleneck_review.sql
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS bottleneck_admin_comment text,
  ADD COLUMN IF NOT EXISTS bottleneck_reviewed_at timestamptz;
