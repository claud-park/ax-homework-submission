// Slack 봇(ax-one-on-one-scheduler)으로 들어온 1-on-1 신청을 읽어 어드민 현황용 예약 형태로 바꾼다.
// 스케줄러는 별도 Supabase 프로젝트의 `pending_1on1` 테이블에 저장하며 챔피언 user id가 없다.
// 그래서 Slack users.info로 프로필 이메일을 얻어 이 앱 users.email과 맞춘다(매핑은 호출자가 한다).
import { createClient } from '@supabase/supabase-js'
import type { OverviewBooking, OverviewBookingStatus } from './overview'

export type SchedulerStatus = 'pending' | 'confirmed' | 'expired' | 'cancelled'

export interface SchedulerSlot {
  start: string // ISO UTC
  end: string // ISO UTC
  available_admins?: string[]
}

/** pending_1on1 중 현황에 필요한 컬럼 */
export interface SchedulerBookingRow {
  id: string
  user_slack_id: string
  user_name: string
  selected_slots: SchedulerSlot[] | null
  status: SchedulerStatus
  confirmed_by: string | null
  confirmed_slot: SchedulerSlot | null
  created_at: string
}

/** 스케줄러 DB 접근 경계. 테스트에서 가짜로 주입한다. */
export interface SchedulerSource {
  fetchBookings(): Promise<SchedulerBookingRow[]>
}

/** Slack user id → 프로필 이메일(없으면 null). 조회 실패는 throw. */
export type SlackEmailLookup = (slackUserId: string) => Promise<string | null>

/**
 * 정규화된 Slack 예약. champion_user_id는 이메일 매핑 뒤에 채운다.
 * pending_1on1에는 updated_at이 없어 updated_at = created_at으로 둔다(확정·취소 시각은 알 수 없음 —
 * 타임라인의 확정/취소 이벤트는 신청 시각에 찍힌다).
 */
export interface SlackBooking extends Omit<OverviewBooking, 'champion_user_id' | 'source'> {
  source: 'slack'
  userSlackId: string
  userName: string
}

export interface SlackBookingWithEmail extends SlackBooking {
  /** trim + 소문자. 조회 실패·이메일 없음이면 null */
  email: string | null
}

const SELECT_COLUMNS = 'id, user_slack_id, user_name, selected_slots, status, confirmed_by, confirmed_slot, created_at'
const FETCH_LIMIT = 1000
const LOOKUP_CONCURRENCY = 5
const EMAIL_CACHE_TTL_MS = 60 * 60 * 1000

function isSlot(s: unknown): s is SchedulerSlot {
  return (
    !!s &&
    typeof (s as SchedulerSlot).start === 'string' &&
    typeof (s as SchedulerSlot).end === 'string'
  )
}

function earliestSlot(slots: SchedulerSlot[] | null): SchedulerSlot | null {
  if (!Array.isArray(slots)) return null
  const valid = slots.filter(isSlot)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => (new Date(b.start).getTime() < new Date(a.start).getTime() ? b : a))
}

/** pending_1on1 한 행을 예약 형태로. expired·슬롯 없는 행은 null. */
export function normalizeSchedulerRow(row: SchedulerBookingRow): SlackBooking | null {
  let slot: SchedulerSlot | null
  let status: OverviewBookingStatus
  switch (row.status) {
    case 'confirmed':
      slot = isSlot(row.confirmed_slot) ? row.confirmed_slot : null
      status = 'confirmed'
      break
    case 'pending':
      slot = earliestSlot(row.selected_slots)
      status = 'pending'
      break
    case 'cancelled':
      slot = isSlot(row.confirmed_slot) ? row.confirmed_slot : earliestSlot(row.selected_slots)
      status = 'cancelled'
      break
    default:
      return null
  }
  if (!slot) return null
  return {
    id: `slack:${row.id}`,
    source: 'slack',
    userSlackId: row.user_slack_id,
    userName: row.user_name,
    slot_start: slot.start,
    slot_end: slot.end,
    status,
    confirmed_by: row.confirmed_by ?? null,
    created_at: row.created_at,
    updated_at: row.created_at,
  }
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const v = email?.trim().toLowerCase()
  return v ? v : null
}

/** 고유 id들을 제한된 동시성으로 조회한다. 실패한 id는 null로 두고 failed에 센다. */
export async function resolveSlackEmails(
  ids: string[],
  lookup: SlackEmailLookup,
  concurrency: number = LOOKUP_CONCURRENCY,
): Promise<{ emails: Map<string, string | null>; failed: number }> {
  const unique = [...new Set(ids)]
  const emails = new Map<string, string | null>()
  let failed = 0
  let cursor = 0
  const worker = async () => {
    while (cursor < unique.length) {
      const id = unique[cursor++]
      try {
        emails.set(id, normalizeEmail(await lookup(id)))
      } catch (e) {
        failed += 1
        emails.set(id, null)
        console.error('[scheduler-bookings] Slack users.info failed:', id, e instanceof Error ? e.message : e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker))
  return { emails, failed }
}

type EmailCache = Map<string, { email: string | null; expiresAt: number }>

/** 서버 인스턴스 단위 메모리 캐시(콜드스타트마다 비워진다). */
const moduleEmailCache: EmailCache = new Map()

/** 성공한 조회(이메일 없음 포함)만 TTL 동안 캐시한다. 실패는 캐시하지 않아 다음 요청에 다시 시도한다. */
export function createCachedSlackEmailLookup(
  raw: SlackEmailLookup,
  opts: { ttlMs?: number; cache?: EmailCache; now?: () => number } = {},
): SlackEmailLookup {
  const ttlMs = opts.ttlMs ?? EMAIL_CACHE_TTL_MS
  const cache = opts.cache ?? moduleEmailCache
  const now = opts.now ?? Date.now
  return async (id) => {
    const hit = cache.get(id)
    if (hit && hit.expiresAt > now()) return hit.email
    const email = await raw(id)
    cache.set(id, { email, expiresAt: now() + ttlMs })
    return email
  }
}

/** 기본 조회: 이 앱의 Slack 봇(스케줄러와 같은 앱). 테스트에서 모듈 로드를 피하려고 지연 import한다. */
export const defaultSlackEmailLookup: SlackEmailLookup = createCachedSlackEmailLookup(async (id) => {
  if (!process.env.SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN missing')
  const { slack } = await import('./slack')
  const res = await slack.users.info({ user: id })
  return res.user?.profile?.email ?? null
})

/** SCHEDULER_SUPABASE_URL/SERVICE_KEY가 없으면 null(기능 꺼짐). */
export function createSchedulerSourceFromEnv(
  env: Record<string, string | undefined> = process.env,
): SchedulerSource | null {
  const url = env.SCHEDULER_SUPABASE_URL
  const key = env.SCHEDULER_SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return {
    async fetchBookings() {
      const { data, error } = await client
        .from('pending_1on1')
        .select(SELECT_COLUMNS)
        .neq('status', 'expired')
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT)
      if (error) throw new Error(`pending_1on1 read failed: ${error.message}`)
      return (data ?? []) as SchedulerBookingRow[]
    },
  }
}

/**
 * 스케줄러 예약을 읽고 정규화한 뒤 Slack 이메일을 붙인다.
 * 스케줄러 조회 실패는 throw(호출자가 error 플래그로 처리). 개별 Slack 조회 실패는 email=null.
 */
export async function loadSchedulerBookings(
  source: SchedulerSource,
  lookup: SlackEmailLookup,
): Promise<{ bookings: SlackBookingWithEmail[]; allLookupsFailed: boolean }> {
  const rows = await source.fetchBookings()
  const normalized = rows.map(normalizeSchedulerRow).filter((b): b is SlackBooking => b !== null)
  const ids = [...new Set(normalized.map((b) => b.userSlackId))]
  const { emails, failed } = await resolveSlackEmails(ids, lookup)
  return {
    bookings: normalized.map((b) => ({ ...b, email: emails.get(b.userSlackId) ?? null })),
    allLookupsFailed: ids.length > 0 && failed === ids.length,
  }
}
