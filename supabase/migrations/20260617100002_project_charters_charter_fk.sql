-- 기존 user_id unique constraint 제거 (1:1 → 1:N)
ALTER TABLE project_charters
  DROP CONSTRAINT IF EXISTS project_charters_user_id_key;

-- charter별 draft FK 추가
ALTER TABLE project_charters
  ADD COLUMN charter_submission_id uuid REFERENCES charter_submissions(id) ON DELETE CASCADE;

-- 기존 draft를 해당 user의 최신 charter에 연결
UPDATE project_charters pc
SET charter_submission_id = (
  SELECT id FROM charter_submissions cs
  WHERE cs.user_id = pc.user_id
  ORDER BY cs.submitted_at DESC
  LIMIT 1
)
WHERE pc.charter_submission_id IS NULL;

-- charter별 unique index (charter_submission_id가 있는 경우만)
CREATE UNIQUE INDEX project_charters_charter_id_key
  ON project_charters(charter_submission_id)
  WHERE charter_submission_id IS NOT NULL;
