-- Multi-charter per champion: 1 user가 여러 charter를 가질 수 있도록
-- 기존 unique constraint (user_id 단독) 제거
ALTER TABLE charter_submissions DROP CONSTRAINT IF EXISTS charter_submissions_user_id_unique;
