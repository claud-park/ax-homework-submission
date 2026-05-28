ALTER TABLE charter_submissions
  ADD COLUMN IF NOT EXISTS admin_approved_at TIMESTAMPTZ;
