-- 체크업 세션 시작 시각(HH:mm) 추가
ALTER TABLE check_up_sessions ADD COLUMN session_time TIME;
