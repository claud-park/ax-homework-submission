import type { SupabaseClient } from '@supabase/supabase-js'

// 처리 락이 stale 로 간주되는 시간(초). maxDuration 300s + 버퍼.
const STALE_SECONDS = 360

/**
 * 세션을 처리용으로 원자적 클레임. processing_status가 in-flight가 아니거나,
 * in-flight라도 시작이 stale(STALE_SECONDS 초과)이면 'transcribing'으로 전환하고
 * true 반환. 이미 다른 처리가 진행 중(비-stale)이면 false.
 *
 * 원자성: 단일 UPDATE를 수행하는 RPC(claim_session_for_processing)로 위임.
 * stale 복구가 없으면 처리가 도중 킬될 때 status가 in-flight에 영구 stuck된다.
 */
export async function claimSessionForProcessing(
  supabase: Pick<SupabaseClient, 'rpc'>,
  sessionId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_session_for_processing', {
    p_session_id: sessionId,
    p_stale_seconds: STALE_SECONDS,
  })
  if (error) throw error
  return data === true
}
