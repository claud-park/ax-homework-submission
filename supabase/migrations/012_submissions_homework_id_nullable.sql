-- submissions.homework_id: 단수 과제 정책 적용
-- 실제 DB에 homework_id 컬럼이 이미 존재하지 않는 경우를 위한 안전한 처리
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'submissions' and column_name = 'homework_id'
  ) then
    alter table submissions alter column homework_id drop not null;
  end if;
end $$;
