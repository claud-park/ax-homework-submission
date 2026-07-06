-- nudge_log 에 주간 지연 넛지 타입('overdue_milestones') 허용.
--
-- 매주 월요일 지연/미완료(빨간 박스) 마일스톤이 있는 champion 에게 보내는
-- 자동 넛지를 기록하기 위해 CHECK 제약에 타입을 추가한다.

ALTER TABLE nudge_log DROP CONSTRAINT IF EXISTS nudge_log_nudge_type_check;
ALTER TABLE nudge_log ADD CONSTRAINT nudge_log_nudge_type_check
  CHECK (nudge_type IN ('no_charter', 'no_milestone', 'delayed_milestone', 'overdue_milestones'));
