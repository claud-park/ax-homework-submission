ALTER TABLE charter_submissions
  ADD COLUMN title text;

-- 기존 charter에 기본 title 부여 (UI 식별용)
UPDATE charter_submissions
SET title = COALESCE(project_name, 'Charter')
WHERE title IS NULL;
