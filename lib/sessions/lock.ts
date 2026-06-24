import type { SupabaseClient } from '@supabase/supabase-js'

const IN_FLIGHT = ['uploading', 'transcribing', 'summarizing'] as const

/**
 * 세션을 처리용으로 원자적 클레임. processing_status가 in-flight가 아닐 때만
 * 'transcribing'으로 전환하고 true 반환. 이미 다른 처리가 진행 중이면 false.
 */
export async function claimSessionForProcessing(
  supabase: Pick<SupabaseClient, 'from'>,
  sessionId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('check_up_sessions')
    .update({ processing_status: 'transcribing' })
    .eq('id', sessionId)
    .not('processing_status', 'in', `(${IN_FLIGHT.join(',')})`)
    .select('id')
  return (data?.length ?? 0) > 0
}
