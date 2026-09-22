-- supabase/migrations/20260922000005_activate_season_rpc.sql
-- 시즌 전환(현재 시즌 플래그 이동)을 원자적으로 수행하는 RPC.
-- 기존 claim_pairing_token/claim_session_for_processing과 동일하게,
-- "여러 UPDATE를 하나의 원자적 동작으로 위임"하는 패턴을 따른다.
--
-- 순서가 중요하다: 기존 is_current 시즌을 먼저 내린 뒤 새 시즌을 올려야
-- seasons_single_current_idx(부분 유니크 인덱스)를 위반하지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION activate_season(p_new_season_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE seasons
  SET is_current = false, status = 'archived'
  WHERE is_current = true AND id != p_new_season_id;

  UPDATE seasons
  SET is_current = true, status = 'active'
  WHERE id = p_new_season_id;
END;
$$;

COMMIT;
