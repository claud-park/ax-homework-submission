// 어드민 1-on-1 현황 데이터 조회. 예약 테이블 RLS에 어드민 정책이 없으므로
// 반드시 서버에서 service client(createServiceClient)로 호출해야 한다.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Season } from '@/lib/types'
import { parseName } from '@/lib/utils'
import {
  buildOneOnOneOverview,
  type OverviewBooking,
  type OverviewRow,
  type OverviewSession,
} from '@/lib/one-on-one/overview'

export interface OneOnOneOverviewResult {
  season: Season | null
  rows: OverviewRow[]
  /** 시즌 start_date가 비어 예약 날짜 필터를 끈 상태(안내 배너용) */
  startDateMissing: boolean
}

function fail(step: string, message: string): never {
  throw new Error(`[one-on-one-admin] ${step} failed: ${message}`)
}

/**
 * 시즌(미지정 시 현재 시즌)의 챔피언별 1-on-1 현황을 조회한다.
 * getCurrentSeasonUserIds는 closed 시즌에 []를 돌려주므로 쓰지 않고 enrollments를 직접 읽는다.
 * 쿼리 수는 챔피언 수와 무관하다(seasons → enrollments → users/sessions/bookings 병렬 bulk `in`).
 */
export async function fetchOneOnOneOverview(
  supabase: SupabaseClient,
  seasonId?: string,
  now: Date = new Date(),
): Promise<OneOnOneOverviewResult> {
  const seasonQuery = supabase.from('seasons').select('*')
  const { data: seasonData, error: seasonErr } = await (seasonId
    ? seasonQuery.eq('id', seasonId)
    : seasonQuery.eq('is_current', true)
  ).maybeSingle()
  if (seasonErr) fail('season', seasonErr.message)
  const season = (seasonData as Season | null) ?? null
  if (!season) return { season: null, rows: [], startDateMissing: false }

  const startDateMissing = !season.start_date

  const { data: enrollments, error: enrollErr } = await supabase
    .from('season_enrollments')
    .select('user_id')
    .eq('season_id', season.id)
    .eq('role_in_season', 'champion')
    .neq('status', 'dropped')
  if (enrollErr) fail('enrollments', enrollErr.message)
  const championIds = ((enrollments ?? []) as { user_id: string }[]).map((e) => e.user_id)
  if (championIds.length === 0) return { season, rows: [], startDateMissing }

  const [usersRes, sessionsRes, bookingsRes] = await Promise.all([
    supabase.from('users').select('id, name').in('id', championIds),
    supabase
      .from('check_up_sessions')
      .select('id, champion_user_id, session_date, session_time, title, created_at')
      .eq('season_id', season.id)
      .in('champion_user_id', championIds),
    supabase
      .from('one_on_one_bookings')
      .select('id, champion_user_id, slot_start, slot_end, status, confirmed_by, created_at, updated_at')
      .in('champion_user_id', championIds),
  ])
  if (usersRes.error) fail('users', usersRes.error.message)
  if (sessionsRes.error) fail('sessions', sessionsRes.error.message)
  if (bookingsRes.error) fail('bookings', bookingsRes.error.message)

  const nameById = new Map(((usersRes.data ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]))
  const champions = championIds.map((userId) => {
    const { displayName, department } = parseName(nameById.get(userId) ?? '(알 수 없음)')
    return { userId, name: displayName, department }
  })

  const rows = buildOneOnOneOverview({
    champions,
    sessions: (sessionsRes.data ?? []) as OverviewSession[],
    bookings: (bookingsRes.data ?? []) as OverviewBooking[],
    now,
    seasonWindow: { startDate: season.start_date, endDate: season.end_date },
  })
  return { season, rows, startDateMissing }
}
