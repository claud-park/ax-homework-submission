import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 새 시즌 차터를 만들 때 연결할 "직전 차터": 같은 사용자의 다른 시즌 published 차터 중 가장 최근 제출본.
 * 없으면 null. 복귀 챔피언의 "이전 시즌 차터 보기" 참조(시즌모델 스펙)에 쓰인다.
 */
export async function findPreviousCharterId(
  supabase: SupabaseClient,
  userId: string,
  currentSeasonId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('charter_submissions')
    .select('id')
    .eq('user_id', userId)
    .neq('season_id', currentSeasonId)
    .eq('publish_status', 'published')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[charter-lineage] findPreviousCharterId failed:', error.message)
    return null
  }
  return (data as { id: string } | null)?.id ?? null
}
