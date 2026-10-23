// 어드민 1-on-1 현황 데이터 조회. 예약 테이블 RLS에 어드민 정책이 없으므로
// 반드시 서버에서 service client(createServiceClient)로 호출해야 한다.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Season } from '@/lib/types'
import { parseName } from '@/lib/utils'
import {
  buildOneOnOneOverview,
  isInSeasonWindow,
  type OverviewBooking,
  type OverviewBookingStatus,
  type OverviewRow,
  type OverviewSession,
} from '@/lib/one-on-one/overview'
import {
  createSchedulerSourceFromEnv,
  defaultSlackEmailLookup,
  loadSchedulerBookings,
  normalizeEmail,
  type SchedulerSource,
  type SlackBookingWithEmail,
  type SlackEmailLookup,
} from '@/lib/one-on-one/scheduler-bookings'

/** 이메일이 이 시즌 챔피언과 맞지 않은 Slack 봇 신청(시즌 기간 안) */
export interface UnmappedSlackBooking {
  id: string
  userName: string
  status: OverviewBookingStatus
  slotStart: string
  createdAt: string
}

export interface SlackBookingsStatus {
  /** 스케줄러 env가 있어 Slack 예약을 읽는 상태 */
  enabled: boolean
  /** 스케줄러 DB 또는 Slack 조회 실패 → 웹 예약만 표시 중 */
  error: boolean
  unmapped: UnmappedSlackBooking[]
}

export interface OneOnOneOverviewResult {
  season: Season | null
  rows: OverviewRow[]
  /** 시즌 start_date가 비어 예약 날짜 필터를 끈 상태(안내 배너용) */
  startDateMissing: boolean
  slack: SlackBookingsStatus
}

export interface OneOnOneOverviewDeps {
  /** undefined면 env(SCHEDULER_SUPABASE_*)로 만든다. null이면 Slack 예약을 읽지 않는다. */
  scheduler?: SchedulerSource | null
  lookupSlackEmail?: SlackEmailLookup
}

type SchedulerLoad = { bookings: SlackBookingWithEmail[]; error: boolean }

/** 절대 throw하지 않는다. 실패는 error 플래그로. */
async function loadSlackSafely(scheduler: SchedulerSource, lookup: SlackEmailLookup): Promise<SchedulerLoad> {
  try {
    const { bookings, allLookupsFailed } = await loadSchedulerBookings(scheduler, lookup)
    return { bookings, error: allLookupsFailed }
  } catch (e) {
    console.error('[one-on-one-admin] Slack bookings read failed (web bookings only):', e instanceof Error ? e.message : e)
    return { bookings: [], error: true }
  }
}

function fail(step: string, message: string): never {
  throw new Error(`[one-on-one-admin] ${step} failed: ${message}`)
}

/**
 * 시즌(미지정 시 현재 시즌)의 챔피언별 1-on-1 현황을 조회한다.
 * getCurrentSeasonUserIds는 closed 시즌에 []를 돌려주므로 쓰지 않고 enrollments를 직접 읽는다.
 * 쿼리 수는 챔피언 수와 무관하다(seasons → enrollments → users/recap 채널/sessions/bookings 병렬 bulk `in`).
 * Slack 봇 예약(스케줄러 DB pending_1on1)은 Slack 프로필 이메일 ↔ users.email로 매핑해 합친다.
 * 스케줄러/Slack 실패는 throw하지 않고 slack.error로 알린다(웹 예약만 표시).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** YYYY-MM-DD의 전날(달력 계산, 타임존 무관). */
function dayBefore(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

export async function fetchOneOnOneOverview(
  supabase: SupabaseClient,
  seasonId?: string,
  now: Date = new Date(),
  deps: OneOnOneOverviewDeps = {},
): Promise<OneOnOneOverviewResult> {
  const scheduler = deps.scheduler === undefined ? createSchedulerSourceFromEnv() : deps.scheduler
  const lookup = deps.lookupSlackEmail ?? defaultSlackEmailLookup
  const emptySlack: SlackBookingsStatus = { enabled: scheduler !== null, error: false, unmapped: [] }

  // UUID가 아닌 값(?season=abc)은 Postgres 22P02를 내므로 현재 시즌으로 되돌린다.
  const validSeasonId = seasonId && UUID_RE.test(seasonId) ? seasonId : undefined
  const seasonQuery = supabase.from('seasons').select('*')
  const { data: seasonData, error: seasonErr } = await (validSeasonId
    ? seasonQuery.eq('id', validSeasonId)
    : seasonQuery.eq('is_current', true)
  ).maybeSingle()
  if (seasonErr) fail('season', seasonErr.message)
  const season = (seasonData as Season | null) ?? null
  if (!season) return { season: null, rows: [], startDateMissing: false, slack: emptySlack }

  const startDateMissing = !season.start_date

  // 예약은 날짜 구간으로 시즌을 가른다. end_date가 비어 있으면(1기 백필 등) 다음 시즌 시작 전날까지로 본다.
  let endDate = season.end_date
  if (!endDate && season.start_date) {
    const { data: all, error: allErr } = await supabase.from('seasons').select('start_date')
    if (allErr) fail('seasons', allErr.message)
    const later = ((all ?? []) as { start_date: string | null }[])
      .map((x) => x.start_date)
      .filter((d): d is string => !!d && d > season.start_date!)
      .sort()[0]
    if (later) endDate = dayBefore(later)
  }

  const { data: enrollments, error: enrollErr } = await supabase
    .from('season_enrollments')
    .select('user_id')
    .eq('season_id', season.id)
    .eq('role_in_season', 'champion')
    .neq('status', 'dropped')
  if (enrollErr) fail('enrollments', enrollErr.message)
  const championIds = ((enrollments ?? []) as { user_id: string }[]).map((e) => e.user_id)
  if (championIds.length === 0) return { season, rows: [], startDateMissing, slack: emptySlack }

  // 스케줄러 DB·Slack은 별도 클라이언트라 supabase 쿼리 수에 영향이 없다. 아래 bulk 조회와 병렬로 돌린다.
  const slackPromise: Promise<SchedulerLoad> | null = scheduler ? loadSlackSafely(scheduler, lookup) : null

  const [usersRes, channelRes, sessionsRes, bookingsRes] = await Promise.all([
    supabase.from('users').select('id, name, email').in('id', championIds),
    // 마이그레이션(20261023000000) 전에는 컬럼이 없을 수 있어 별도 best-effort 조회로 둔다.
    supabase.from('users').select('id, recap_slack_channel_id').in('id', championIds),
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

  const channelById = new Map<string, string | null>()
  if (channelRes.error) {
    console.error('[one-on-one-admin] recap channel read failed (treated as unset):', channelRes.error.message)
  } else {
    for (const u of (channelRes.data ?? []) as { id: string; recap_slack_channel_id: string | null }[]) {
      channelById.set(u.id, u.recap_slack_channel_id ?? null)
    }
  }

  const users = (usersRes.data ?? []) as { id: string; name: string; email: string | null }[]
  const nameById = new Map(users.map((u) => [u.id, u.name]))
  const champions = championIds.map((userId) => {
    const { displayName, department } = parseName(nameById.get(userId) ?? '(알 수 없음)')
    return { userId, name: displayName, department, recapChannelId: channelById.get(userId) ?? null }
  })

  const webBookings = ((bookingsRes.data ?? []) as OverviewBooking[]).map((b) => ({ ...b, source: 'web' as const }))

  // Slack 예약: 이메일로 이 시즌 챔피언에 매핑. 안 맞으면 시즌 기간 안의 것만 미매핑으로 노출한다.
  const slack: SlackBookingsStatus = { ...emptySlack }
  const slackBookings: OverviewBooking[] = []
  if (slackPromise) {
    const loaded = await slackPromise
    slack.error = loaded.error
    const userIdByEmail = new Map<string, string>()
    for (const u of users) {
      const email = normalizeEmail(u.email)
      if (email) userIdByEmail.set(email, u.id)
    }
    for (const b of loaded.bookings) {
      const userId = b.email ? userIdByEmail.get(b.email) : undefined
      if (userId) {
        slackBookings.push({
          id: b.id,
          champion_user_id: userId,
          slot_start: b.slot_start,
          slot_end: b.slot_end,
          status: b.status,
          confirmed_by: b.confirmed_by,
          created_at: b.created_at,
          updated_at: b.updated_at,
          source: 'slack',
        })
      } else if (isInSeasonWindow(b.slot_start, season.start_date, endDate)) {
        slack.unmapped.push({
          id: b.id,
          userName: b.userName,
          status: b.status,
          slotStart: b.slot_start,
          createdAt: b.created_at,
        })
      }
    }
  }

  const rows = buildOneOnOneOverview({
    champions,
    sessions: (sessionsRes.data ?? []) as OverviewSession[],
    bookings: [...webBookings, ...slackBookings],
    now,
    seasonWindow: { startDate: season.start_date, endDate },
  })
  return { season, rows, startDateMissing, slack }
}
