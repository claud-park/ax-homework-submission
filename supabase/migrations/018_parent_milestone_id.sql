-- 018_parent_milestone_id.sql
-- sub_tasks 테이블을 milestones.parent_milestone_id로 대체
-- milestone_deliverables 완전 제거

-- 1. parent_milestone_id 컬럼 추가
ALTER TABLE milestones
  ADD COLUMN parent_milestone_id uuid REFERENCES milestones(id) ON DELETE SET NULL;

-- 2. 기존 sub_tasks → depth-0 milestones로 마이그레이션
INSERT INTO milestones (id, user_id, title, description, display_order, publish_status, created_at, updated_at)
SELECT id, user_id, title, description, display_order, publish_status, created_at, updated_at
FROM sub_tasks
ON CONFLICT (id) DO NOTHING;

-- 3. milestones.sub_task_id → parent_milestone_id 연결
UPDATE milestones
SET parent_milestone_id = sub_task_id
WHERE sub_task_id IS NOT NULL;

-- 4. sub_task_id 컬럼 제거
ALTER TABLE milestones DROP COLUMN sub_task_id;

-- 5. sub_tasks 테이블 제거
DROP TABLE sub_tasks;

-- 6. milestone_deliverables 제거
DROP TABLE milestone_deliverables;

-- 7. 인덱스 생성
CREATE INDEX milestones_parent_milestone_id
  ON milestones(parent_milestone_id)
  WHERE parent_milestone_id IS NOT NULL;
