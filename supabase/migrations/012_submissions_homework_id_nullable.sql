-- submissions.homework_id: NOT NULL → nullable
-- 단수 과제 정책: 과제는 항상 한 개만 제공되므로 제출 시 homework_id 명시 불필요
alter table submissions
  alter column homework_id drop not null;
