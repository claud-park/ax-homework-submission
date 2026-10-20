import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCurrentSeasonId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle()
  if (error) console.error('[season] getCurrentSeasonId failed:', error.message)
  if (error || !data) return null
  return (data as { id: string }).id
}

/** 어떤 행과도 매칭되지 않는 uuid. 현재 시즌이 없을 때 읽기 필터에 넣어 "빈 결과"를 보장한다. */
export const NIL_SEASON_ID = '00000000-0000-0000-0000-000000000000'

/**
 * 읽기 쿼리의 `.eq('season_id', …)`에 쓸 현재 시즌 id. 현재 시즌이 없으면 NIL_SEASON_ID를 돌려준다
 * — `.eq('season_id', null)`은 PostgREST가 uuid 파싱 에러를 내므로 null을 넘기면 안 된다.
 */
export async function getCurrentSeasonIdOrNil(supabase: SupabaseClient): Promise<string> {
  return (await getCurrentSeasonId(supabase)) ?? NIL_SEASON_ID
}

export async function getCurrentSeasonUserIds(
  supabase: SupabaseClient,
  role: 'champion' | 'partner',
): Promise<string[]> {
  const seasonId = await getCurrentSeasonId(supabase)
  if (!seasonId) return []

  const { data: season, error: statusErr } = await supabase
    .from('seasons')
    .select('status')
    .eq('id', seasonId)
    .maybeSingle()
  if (statusErr) console.error('[season] getCurrentSeasonUserIds failed:', statusErr.message)
  // 시즌 자체가 closed면(예: 다음 시즌이 아직 활성화되지 않은 공백 구간) 진행상황 추적 화면에는
  // 아무도 표시하지 않는다 — is_current 플래그만으로는 "진짜로 진행 중"을 보장하지 못한다.
  if ((season as { status?: string } | null)?.status === 'closed') return []

  const { data, error } = await supabase
    .from('season_enrollments')
    .select('user_id')
    .eq('season_id', seasonId)
    .eq('role_in_season', role)
    .neq('status', 'dropped')
  if (error) console.error('[season] getCurrentSeasonUserIds failed:', error.message)
  if (error || !data) return []
  return (data as { user_id: string }[]).map((row) => row.user_id)
}

export async function isEnrolledInCurrentSeason(
  supabase: SupabaseClient,
  userId: string,
  role: 'champion' | 'partner',
): Promise<boolean> {
  const seasonId = await getCurrentSeasonId(supabase)
  if (!seasonId) return false
  const { data, error } = await supabase
    .from('season_enrollments')
    .select('id')
    .eq('season_id', seasonId)
    .eq('user_id', userId)
    .eq('role_in_season', role)
    .eq('status', 'active')
    .maybeSingle()
  if (error) console.error('[season] isEnrolledInCurrentSeason failed:', error.message)
  if (error || !data) return false
  return true
}

/**
 * 새로 INSERT하는 시즌 스코프 행에 채울 현재 시즌 id를 반환한다.
 * 현재 시즌이 없으면 에러를 던진다 — 쓰기 API는 이 경우 계속 진행하면 안 된다.
 */
export async function requireCurrentSeasonIdForWrite(supabase: SupabaseClient): Promise<string> {
  const seasonId = await getCurrentSeasonId(supabase)
  if (!seasonId) throw new Error('현재 시즌이 설정되지 않았습니다')
  return seasonId
}

/**
 * check_up_sessions의 자식 행(session_action_items)이 부모 세션과 같은
 * season_id를 갖도록, 부모 세션의 season_id를 조회한다.
 */
export async function getSeasonIdForCheckUpSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('check_up_sessions')
    .select('season_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) console.error('[season] getSeasonIdForCheckUpSession failed:', error.message)
  if (error || !data) return null
  return (data as { season_id: string }).season_id
}
