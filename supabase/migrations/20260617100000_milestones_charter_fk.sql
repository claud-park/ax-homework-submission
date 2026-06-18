ALTER TABLE milestones
  ADD COLUMN charter_submission_id uuid REFERENCES charter_submissions(id) ON DELETE SET NULL;

-- 기존 milestone → 해당 user의 가장 최근 published charter에 귀속
UPDATE milestones m
SET charter_submission_id = (
  SELECT id FROM charter_submissions cs
  WHERE cs.user_id = m.user_id
    AND cs.publish_status = 'published'
  ORDER BY cs.submitted_at DESC
  LIMIT 1
)
WHERE m.charter_submission_id IS NULL;
