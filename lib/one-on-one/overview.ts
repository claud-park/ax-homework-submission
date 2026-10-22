// 어드민 1-on-1 현황 집계 — 순수 함수만 둔다(DB 접근은 lib/data/one-on-one-admin.ts).
// 날짜 판단은 모두 KST 기준이며 `now`는 호출자가 주입한다.
import { kstTodayStr } from '@/lib/nudge/overdue'

export type OverviewBookingStatus = 'pending' | 'confirmed' | 'cancelled'

/** check_up_sessions 중 현황 집계에 필요한 컬럼 */
export interface OverviewSession {
  id: string
  champion_user_id: string
  session_date: string // YYYY-MM-DD (KST)
  session_time: string | null // HH:mm[:ss] (KST)
  title: string
  created_at: string
}

export interface NumberedSession extends OverviewSession {
  /** 시즌 내 회차(1..N) */
  number: number
}

/** one_on_one_bookings 중 현황 집계에 필요한 컬럼 */
export interface OverviewBooking {
  id: string
  champion_user_id: string
  slot_start: string // ISO UTC
  slot_end: string // ISO UTC
  status: OverviewBookingStatus
  confirmed_by: string | null
  created_at: string
  updated_at: string
}

export interface OverviewChampion {
  userId: string
  name: string
  department: string
}

export interface SeasonWindow {
  startDate: string | null
  endDate: string | null
}

export type TimelineEvent =
  | { kind: 'booking_requested'; at: string; bookingId: string; slotStart: string; status: OverviewBookingStatus }
  | { kind: 'booking_confirmed'; at: string; bookingId: string; slotStart: string; confirmedBy: string | null }
  | { kind: 'booking_cancelled'; at: string; bookingId: string; slotStart: string }
  | {
      kind: 'session'
      at: string
      sessionId: string
      number: number
      sessionDate: string
      sessionTime: string | null
      title: string
    }

export interface OverviewFlags {
  /** 지난 confirmed 예약인데 같은 KST 날짜의 세션 기록이 없음 */
  missingRecord: boolean
  /** 시즌 내 세션 0건 */
  zeroMeetings: boolean
}

export interface OverviewRow {
  userId: string
  name: string
  department: string
  sessionCount: number
  lastSession: NumberedSession | null
  nextBooking: OverviewBooking | null
  pendingBooking: OverviewBooking | null
  cancelledCount: number
  latestRequestAt: string | null
  flags: OverviewFlags
  /** 신청·확정·취소·세션을 시간 오름차순으로 합친 상세 이력 */
  timeline: TimelineEvent[]
}

export type OverviewChip = 'all' | 'pending' | 'upcoming' | 'zero' | 'missing'

export interface BuildOverviewInput {
  champions: OverviewChampion[]
  sessions: OverviewSession[]
  bookings: OverviewBooking[]
  now: Date
  seasonWindow: SeasonWindow
}

/** ISO 시각의 KST 날짜(YYYY-MM-DD) */
export function kstDateOf(iso: string): string {
  return kstTodayStr(new Date(iso))
}

/** slot의 KST 날짜가 시즌 start~end(양끝 포함) 안인지. start가 null이면 필터를 끈다. */
export function isInSeasonWindow(slotIso: string, startDate: string | null, endDate: string | null): boolean {
  if (!startDate) return true
  const day = kstDateOf(slotIso)
  if (day < startDate) return false
  if (endDate && day > endDate) return false
  return true
}

/** (session_date, session_time nulls last, created_at) 오름차순으로 1..N 회차를 매긴다. */
export function numberSessions<T extends OverviewSession>(sessions: T[]): (T & { number: number })[] {
  return [...sessions]
    .sort((a, b) => {
      if (a.session_date !== b.session_date) return a.session_date < b.session_date ? -1 : 1
      if (a.session_time !== b.session_time) {
        if (a.session_time === null) return 1
        if (b.session_time === null) return -1
        return a.session_time < b.session_time ? -1 : 1
      }
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
      return 0
    })
    .map((s, i) => ({ ...s, number: i + 1 }))
}

/** 세션의 KST 일시를 ISO로. 시간이 없으면 그날 마지막 시각으로 둬 같은 날 예약 이벤트 뒤에 온다. */
function sessionInstant(s: OverviewSession): string {
  const time = s.session_time ? s.session_time.slice(0, 5) + ':00' : '23:59:59'
  return new Date(`${s.session_date}T${time}+09:00`).toISOString()
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

function buildTimeline(bookings: OverviewBooking[], sessions: NumberedSession[]): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const b of bookings) {
    events.push({ kind: 'booking_requested', at: b.created_at, bookingId: b.id, slotStart: b.slot_start, status: b.status })
    if (b.status === 'confirmed') {
      events.push({
        kind: 'booking_confirmed',
        at: b.updated_at,
        bookingId: b.id,
        slotStart: b.slot_start,
        confirmedBy: b.confirmed_by,
      })
    } else if (b.status === 'cancelled') {
      events.push({ kind: 'booking_cancelled', at: b.updated_at, bookingId: b.id, slotStart: b.slot_start })
    }
  }
  for (const s of sessions) {
    events.push({
      kind: 'session',
      at: sessionInstant(s),
      sessionId: s.id,
      number: s.number,
      sessionDate: s.session_date,
      sessionTime: s.session_time,
      title: s.title,
    })
  }
  // 안정 정렬: 같은 시각이면 삽입 순서(신청 → 확정/취소) 유지
  return events
    .map((e, i) => ({ e, i, t: new Date(e.at).getTime() }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(({ e }) => e)
}

export function buildOneOnOneOverview(input: BuildOverviewInput): OverviewRow[] {
  const { champions, sessions, bookings, now, seasonWindow } = input
  const nowMs = now.getTime()
  const championIds = new Set(champions.map((c) => c.userId))

  const sessionsByUser = groupBy(
    sessions.filter((s) => championIds.has(s.champion_user_id)),
    (s) => s.champion_user_id,
  )
  const bookingsByUser = groupBy(
    bookings.filter(
      (b) =>
        championIds.has(b.champion_user_id) &&
        isInSeasonWindow(b.slot_start, seasonWindow.startDate, seasonWindow.endDate),
    ),
    (b) => b.champion_user_id,
  )

  return champions.map((c) => {
    const numbered = numberSessions(sessionsByUser.get(c.userId) ?? [])
    const userBookings = bookingsByUser.get(c.userId) ?? []
    const sessionDates = new Set(numbered.map((s) => s.session_date))

    let nextBooking: OverviewBooking | null = null
    let pendingBooking: OverviewBooking | null = null
    let cancelledCount = 0
    let latestRequestAt: string | null = null
    let missingRecord = false

    for (const b of userBookings) {
      if (latestRequestAt === null || b.created_at > latestRequestAt) latestRequestAt = b.created_at
      const slotMs = new Date(b.slot_start).getTime()
      if (b.status === 'pending') {
        if (!pendingBooking || b.created_at > pendingBooking.created_at) pendingBooking = b
      } else if (b.status === 'cancelled') {
        cancelledCount += 1
      } else if (slotMs > nowMs) {
        if (!nextBooking || slotMs < new Date(nextBooking.slot_start).getTime()) nextBooking = b
      } else if (!sessionDates.has(kstDateOf(b.slot_start))) {
        missingRecord = true
      }
    }

    return {
      userId: c.userId,
      name: c.name,
      department: c.department,
      sessionCount: numbered.length,
      lastSession: numbered.length > 0 ? numbered[numbered.length - 1] : null,
      nextBooking,
      pendingBooking,
      cancelledCount,
      latestRequestAt,
      flags: { missingRecord, zeroMeetings: numbered.length === 0 },
      timeline: buildTimeline(userBookings, numbered),
    }
  })
}

export function filterRows(rows: OverviewRow[], chip: OverviewChip): OverviewRow[] {
  switch (chip) {
    case 'pending':
      return rows.filter((r) => r.pendingBooking !== null)
    case 'upcoming':
      return rows.filter((r) => r.nextBooking !== null)
    case 'zero':
      return rows.filter((r) => r.flags.zeroMeetings)
    case 'missing':
      return rows.filter((r) => r.flags.missingRecord)
    case 'all':
    default:
      return rows
  }
}

/** 기본 정렬: 대기 신청 있는 챔피언 우선 → 회차 오름차순 → 이름. 원본은 바꾸지 않는다. */
export function sortRows(rows: OverviewRow[]): OverviewRow[] {
  return [...rows].sort((a, b) => {
    const pa = a.pendingBooking ? 0 : 1
    const pb = b.pendingBooking ? 0 : 1
    if (pa !== pb) return pa - pb
    if (a.sessionCount !== b.sessionCount) return a.sessionCount - b.sessionCount
    return a.name.localeCompare(b.name, 'ko')
  })
}
