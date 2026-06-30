-- supabase/migrations/20260630000000_session_low_quality_status.sql
-- processing_status에 'low_quality' 허용. 기존 컬럼에 CHECK 제약이 없으면
-- 애플리케이션 레벨 상수만으로 충분하나, 제약이 있을 경우를 대비해 재정의한다.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'check_up_sessions' and column_name = 'processing_status'
  ) then
    alter table check_up_sessions drop constraint if exists check_up_sessions_processing_status_check;
    alter table check_up_sessions add constraint check_up_sessions_processing_status_check
      check (processing_status in ('idle','uploading','transcribing','summarizing','done','error','low_quality'));
  end if;
end $$;
