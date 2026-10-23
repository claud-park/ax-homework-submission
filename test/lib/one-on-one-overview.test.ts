import { describe, it, expect } from 'vitest'
import {
  kstDateOf,
  isInSeasonWindow,
  numberSessions,
  buildOneOnOneOverview,
  filterRows,
  sortRows,
  type OverviewBooking,
  type OverviewChampion,
  type OverviewRow,
  type OverviewSession,
} from '@/lib/one-on-one/overview'

function session(p: Partial<OverviewSession> & { id: string }): OverviewSession {
  return {
    champion_user_id: 'u1',
    session_date: '2026-10-01',
    session_time: null,
    title: '1on1',
    created_at: '2026-10-01T00:00:00Z',
    ...p,
  }
}

function booking(p: Partial<OverviewBooking> & { id: string }): OverviewBooking {
  return {
    champion_user_id: 'u1',
    slot_start: '2026-10-10T05:00:00Z',
    slot_end: '2026-10-10T05:30:00Z',
    status: 'pending',
    confirmed_by: null,
    created_at: '2026-10-05T01:00:00Z',
    updated_at: '2026-10-05T01:00:00Z',
    ...p,
  }
}

const champ = (userId: string, name = `이름${userId}`): OverviewChampion => ({
  userId,
  name,
  department: '팀',
})

const NOW = new Date('2026-10-22T03:00:00Z') // KST 2026-10-22 12:00
const WINDOW = { startDate: '2026-10-01', endDate: '2026-12-31' }

describe('kstDateOf', () => {
  it('UTC 15:00 이후는 KST 다음날', () => {
    expect(kstDateOf('2026-10-21T15:00:00Z')).toBe('2026-10-22')
    expect(kstDateOf('2026-10-21T14:59:59Z')).toBe('2026-10-21')
  })
})

describe('isInSeasonWindow', () => {
  it('start가 null이면 항상 true', () => {
    expect(isInSeasonWindow('2020-01-01T00:00:00Z', null, null)).toBe(true)
    expect(isInSeasonWindow('2020-01-01T00:00:00Z', null, '2019-01-01')).toBe(true)
  })
  it('start/end 당일 포함(KST 기준)', () => {
    expect(isInSeasonWindow('2026-09-30T15:00:00Z', '2026-10-01', '2026-10-31')).toBe(true)
    expect(isInSeasonWindow('2026-09-30T14:59:00Z', '2026-10-01', '2026-10-31')).toBe(false)
    expect(isInSeasonWindow('2026-10-31T14:59:00Z', '2026-10-01', '2026-10-31')).toBe(true)
    expect(isInSeasonWindow('2026-10-31T15:00:00Z', '2026-10-01', '2026-10-31')).toBe(false)
  })
  it('end가 null이면 상한 없음', () => {
    expect(isInSeasonWindow('2030-01-01T00:00:00Z', '2026-10-01', null)).toBe(true)
  })
})

describe('numberSessions', () => {
  it('빈 배열', () => {
    expect(numberSessions([])).toEqual([])
  })
  it('date → time(null last) → created_at 순으로 1..N', () => {
    const out = numberSessions([
      session({ id: 'c', session_date: '2026-10-02', session_time: null, created_at: '2026-10-02T01:00:00Z' }),
      session({ id: 'd', session_date: '2026-10-02', session_time: null, created_at: '2026-10-02T00:00:00Z' }),
      session({ id: 'b', session_date: '2026-10-02', session_time: '14:00:00' }),
      session({ id: 'a', session_date: '2026-10-01', session_time: '18:00:00' }),
    ])
    expect(out.map((s) => [s.id, s.number])).toEqual([
      ['a', 1],
      ['b', 2],
      ['d', 3],
      ['c', 4],
    ])
  })
})

describe('buildOneOnOneOverview', () => {
  const build = (
    sessions: OverviewSession[],
    bookings: OverviewBooking[],
    champions: OverviewChampion[] = [champ('u1')],
    seasonWindow = WINDOW,
  ) => buildOneOnOneOverview({ champions, sessions, bookings, now: NOW, seasonWindow })

  it('세션·예약 0건 챔피언도 행을 갖고 zeroMeetings 플래그', () => {
    const [row] = build([], [])
    expect(row).toMatchObject({
      userId: 'u1',
      sessionCount: 0,
      lastSession: null,
      nextBooking: null,
      pendingBooking: null,
      cancelledCount: 0,
      latestRequestAt: null,
      flags: { missingRecord: false, zeroMeetings: true },
      timeline: [],
    })
  })

  it('pending 예약은 대기로 잡힌다', () => {
    const [row] = build([], [booking({ id: 'p1', status: 'pending' })])
    expect(row.pendingBooking?.id).toBe('p1')
    expect(row.nextBooking).toBeNull()
  })

  it('다음 미팅 = 미래 confirmed 중 최소 slot', () => {
    const [row] = build(
      [],
      [
        booking({ id: 'far', status: 'confirmed', slot_start: '2026-11-20T05:00:00Z' }),
        booking({ id: 'near', status: 'confirmed', slot_start: '2026-10-25T05:00:00Z' }),
        booking({ id: 'past', status: 'confirmed', slot_start: '2026-10-20T05:00:00Z' }),
        booking({ id: 'pend', status: 'pending', slot_start: '2026-10-23T05:00:00Z' }),
      ],
    )
    expect(row.nextBooking?.id).toBe('near')
  })

  it('취소 건수와 최신 신청 시각', () => {
    const [row] = build(
      [],
      [
        booking({ id: 'x1', status: 'cancelled', created_at: '2026-10-03T00:00:00Z' }),
        booking({ id: 'x2', status: 'cancelled', created_at: '2026-10-07T00:00:00Z' }),
        booking({ id: 'p', status: 'pending', created_at: '2026-10-06T00:00:00Z' }),
      ],
    )
    expect(row.cancelledCount).toBe(2)
    expect(row.latestRequestAt).toBe('2026-10-07T00:00:00Z')
  })

  it('missingRecord: 지난 confirmed인데 같은 KST 날짜 세션 없음', () => {
    // slot KST 2026-10-15 00:30 (UTC 10-14 15:30) — 세션은 10-15에 있음 → 누락 아님
    const ok = build(
      [session({ id: 's1', session_date: '2026-10-15' })],
      [booking({ id: 'c1', status: 'confirmed', slot_start: '2026-10-14T15:30:00Z' })],
    )[0]
    expect(ok.flags.missingRecord).toBe(false)

    const missing = build(
      [session({ id: 's1', session_date: '2026-10-14' })],
      [booking({ id: 'c1', status: 'confirmed', slot_start: '2026-10-14T15:30:00Z' })],
    )[0]
    expect(missing.flags.missingRecord).toBe(true)

    // 미래 confirmed는 누락 아님
    const future = build([], [booking({ id: 'c2', status: 'confirmed', slot_start: '2026-10-30T05:00:00Z' })])[0]
    expect(future.flags.missingRecord).toBe(false)
  })

  it('같은 날 pending+confirmed+cancelled 혼재', () => {
    const slot = '2026-10-15T05:00:00Z'
    const [row] = build(
      [],
      [
        booking({ id: 'a', status: 'cancelled', slot_start: slot }),
        booking({ id: 'b', status: 'confirmed', slot_start: slot }),
        booking({ id: 'c', status: 'pending', slot_start: slot }),
      ],
    )
    expect(row.cancelledCount).toBe(1)
    expect(row.pendingBooking?.id).toBe('c')
    expect(row.flags.missingRecord).toBe(true)
  })

  it('시즌 밖 예약과 비챔피언 예약/세션은 무시', () => {
    const [row] = build(
      [session({ id: 'other', champion_user_id: 'stranger' })],
      [
        booking({ id: 'before', status: 'cancelled', slot_start: '2026-09-30T14:00:00Z' }),
        booking({ id: 'stranger', champion_user_id: 'stranger', status: 'pending' }),
      ],
    )
    expect(row.cancelledCount).toBe(0)
    expect(row.pendingBooking).toBeNull()
    expect(row.sessionCount).toBe(0)
  })

  it('start_date null이면 예약 날짜 필터를 끈다', () => {
    const [row] = build(
      [],
      [booking({ id: 'old', status: 'cancelled', slot_start: '2025-01-01T00:00:00Z' })],
      [champ('u1')],
      { startDate: null, endDate: null } as unknown as typeof WINDOW,
    )
    expect(row.cancelledCount).toBe(1)
  })

  it('회차·마지막 미팅과 시간순 timeline', () => {
    const [row] = build(
      [
        session({ id: 's2', session_date: '2026-10-12', session_time: '14:00:00' }),
        session({ id: 's1', session_date: '2026-10-02', session_time: '10:00:00' }),
      ],
      [
        booking({
          id: 'b1',
          status: 'confirmed',
          confirmed_by: 'claud',
          slot_start: '2026-10-12T05:00:00Z',
          created_at: '2026-10-08T00:00:00Z',
          updated_at: '2026-10-09T00:00:00Z',
        }),
        booking({
          id: 'b2',
          status: 'cancelled',
          slot_start: '2026-10-20T05:00:00Z',
          created_at: '2026-10-13T00:00:00Z',
          updated_at: '2026-10-14T00:00:00Z',
        }),
      ],
    )
    expect(row.sessionCount).toBe(2)
    expect(row.lastSession).toMatchObject({ id: 's2', number: 2 })
    expect(row.flags).toEqual({ missingRecord: false, zeroMeetings: false })
    expect(row.timeline.map((e) => `${e.kind}:${e.kind === 'session' ? e.sessionId : e.bookingId}`)).toEqual([
      'session:s1',
      'booking_requested:b1',
      'booking_confirmed:b1',
      'session:s2',
      'booking_requested:b2',
      'booking_cancelled:b2',
    ])
    const s2 = row.timeline.find((e) => e.kind === 'session' && e.sessionId === 's2')
    expect(s2).toMatchObject({ number: 2, at: '2026-10-12T05:00:00.000Z' })
    const conf = row.timeline.find((e) => e.kind === 'booking_confirmed')
    expect(conf).toMatchObject({ at: '2026-10-09T00:00:00Z', confirmedBy: 'claud', slotStart: '2026-10-12T05:00:00Z' })
  })
})

function row(p: Partial<OverviewRow> & { userId: string }): OverviewRow {
  return {
    name: p.userId,
    department: '',
    recapChannelId: null,
    sessionCount: 0,
    lastSession: null,
    nextBooking: null,
    pendingBooking: null,
    cancelledCount: 0,
    latestRequestAt: null,
    flags: { missingRecord: false, zeroMeetings: false },
    timeline: [],
    ...p,
  }
}

describe('filterRows', () => {
  const rows = [
    row({ userId: 'pending', pendingBooking: booking({ id: 'p' }) }),
    row({ userId: 'upcoming', nextBooking: booking({ id: 'n', status: 'confirmed' }) }),
    row({ userId: 'zero', flags: { missingRecord: false, zeroMeetings: true } }),
    row({ userId: 'missing', flags: { missingRecord: true, zeroMeetings: false } }),
  ]
  const ids = (chip: Parameters<typeof filterRows>[1]) => filterRows(rows, chip).map((r) => r.userId)

  it('all', () => expect(ids('all')).toEqual(['pending', 'upcoming', 'zero', 'missing']))
  it('pending', () => expect(ids('pending')).toEqual(['pending']))
  it('upcoming', () => expect(ids('upcoming')).toEqual(['upcoming']))
  it('zero', () => expect(ids('zero')).toEqual(['zero']))
  it('missing', () => expect(ids('missing')).toEqual(['missing']))
})

describe('sortRows', () => {
  it('대기 우선 → 회차 오름차순 → 이름, 원본 불변', () => {
    const input = [
      row({ userId: 'a', name: '다', sessionCount: 1 }),
      row({ userId: 'b', name: '나', sessionCount: 3, pendingBooking: booking({ id: 'p1' }) }),
      row({ userId: 'c', name: '가', sessionCount: 1 }),
      row({ userId: 'd', name: '라', sessionCount: 0 }),
      row({ userId: 'e', name: '마', sessionCount: 2, pendingBooking: booking({ id: 'p2' }) }),
    ]
    const out = sortRows(input)
    expect(out.map((r) => r.userId)).toEqual(['e', 'b', 'd', 'c', 'a'])
    expect(input.map((r) => r.userId)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('missingRecord: 당일 미팅은 다음 날부터', () => {
  it('같은 KST 날짜의 지난 confirmed는 아직 누락으로 보지 않는다', () => {
    const now = new Date('2026-10-22T08:00:00Z') // KST 10-22 17:00
    const rows = buildOneOnOneOverview({
      champions: [{ userId: 'u1', name: 'a', department: 'd' }],
      sessions: [],
      bookings: [{ id: 'b', champion_user_id: 'u1', slot_start: '2026-10-22T02:00:00Z', slot_end: '2026-10-22T02:30:00Z', status: 'confirmed', confirmed_by: 'claud', created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' }],
      now,
      seasonWindow: { startDate: '2026-10-01', endDate: null },
    })
    expect(rows[0].flags.missingRecord).toBe(false)
    const later = buildOneOnOneOverview({
      champions: [{ userId: 'u1', name: 'a', department: 'd' }],
      sessions: [],
      bookings: [{ id: 'b', champion_user_id: 'u1', slot_start: '2026-10-22T02:00:00Z', slot_end: '2026-10-22T02:30:00Z', status: 'confirmed', confirmed_by: 'claud', created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' }],
      now: new Date('2026-10-23T01:00:00Z'),
      seasonWindow: { startDate: '2026-10-01', endDate: null },
    })
    expect(later[0].flags.missingRecord).toBe(true)
  })
})
