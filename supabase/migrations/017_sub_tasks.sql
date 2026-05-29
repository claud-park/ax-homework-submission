-- 017_sub_tasks.sql
-- sub_tasks 테이블 신규 생성 + milestones.sub_task_id 컬럼 추가

CREATE TABLE sub_tasks (
  id            uuid            PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text            NOT NULL,
  description   text,
  display_order int             NOT NULL DEFAULT 0,
  publish_status publish_status NOT NULL DEFAULT 'draft',
  created_at    timestamptz     NOT NULL DEFAULT now(),
  updated_at    timestamptz     NOT NULL DEFAULT now()
);

ALTER TABLE sub_tasks ENABLE ROW LEVEL SECURITY;
-- No policies: service key bypasses RLS

ALTER TABLE milestones
  ADD COLUMN sub_task_id uuid REFERENCES sub_tasks(id) ON DELETE SET NULL;

CREATE INDEX sub_tasks_user_id ON sub_tasks(user_id);
CREATE INDEX milestones_sub_task_id ON milestones(sub_task_id) WHERE sub_task_id IS NOT NULL;
