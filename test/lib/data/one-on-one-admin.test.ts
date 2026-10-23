import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOneOnOneOverview } from '@/lib/data/one-on-one-admin'
import type { SchedulerBookingRow, SchedulerSource } from '@/lib/one-on-one/scheduler-bookings'

// 기본 스케줄러 소스는 env에서 만든다. 테스트가 실제 스케줄러 DB에 닿지 않게 env를 비운다.
beforeEach(() => {
  vi.stubEnv('SCHEDULER_SUPABASE_URL', '')
  vi.stubEnv('SCHEDULER_SUPABASE_SERVICE_KEY', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

type Filter = { op: 'eq' | 'neq' | 'in'; field: string; value: unknown }
type Call = { table: string; filters: Filter[] }

/** 테이블별 고정 응답 + eq/neq/in 필터를 실제로 적용하는 체이너블 목. 호출 기록을 남긴다. */
function createSupabaseMock(
  tables: Record<string, Record<string, unknown>[]>,
  failSelect?: (table: string, columns: string) => { code: string; message: string } | null,
) {
  const calls: Call[] = []
  const from = vi.fn((table: string) => {
    const call: Call = { table, filters: [] }
    let columns = '*'
    calls.push(call)
    const apply = () =>
      (tables[table] ?? []).filter((row) =>
        call.filters.every((f) => {
          if (f.op === 'eq') return row[f.field] === f.value
          if (f.op === 'neq') return row[f.field] !== f.value
          return (f.value as unknown[]).includes(row[f.field])
        }),
      )
    const builder: Record<string, unknown> = {
      select: vi.fn((c: string = '*') => ((columns = c), builder)),
      order: vi.fn(() => builder),
      eq: vi.fn((field: string, value: unknown) => (call.filters.push({ op: 'eq', field, value }), builder)),
      neq: vi.fn((field: string, value: unknown) => (call.filters.push({ op: 'neq', field, value }), builder)),
      in: vi.fn((field: string, value: unknown[]) => (call.filters.push({ op: 'in', field, value }), builder)),
      maybeSingle: vi.fn(() => Promise.resolve({ data: apply()[0] ?? null, error: null })),
      then: (resolve: (v: unknown) => void) => {
        const err = failSelect?.(table, columns) ?? null
        resolve(err ? { data: null, error: err } : { data: apply(), error: null })
      },
    }
    return builder
  })
  return { supabase: { from } as unknown as SupabaseClient, calls }
}

const NOW = new Date('2026-10-22T03:00:00Z')

const season2 = {
  id: 's2',
  name: '2기',
  status: 'active',
  is_current: true,
  start_date: '2026-10-01',
  end_date: null,
  created_at: '2026-09-01T00:00:00Z',
}
const season1 = { ...season2, id: 's1', name: '1기', status: 'closed', is_current: false, start_date: null }

function enrollment(user_id: string, extra: Record<string, unknown> = {}) {
  return { season_id: 's2', user_id, role_in_season: 'champion', status: 'active', ...extra }
}

function baseTables(championCount: number) {
  const ids = Array.from({ length: championCount }, (_, i) => `u${i + 1}`)
  return {
    seasons: [season2, season1],
    season_enrollments: [
      ...ids.map((id) => enrollment(id)),
      enrollment('dropped', { status: 'dropped' }),
      enrollment('partner', { role_in_season: 'partner' }),
    ],
    users: [...ids, 'dropped', 'partner'].map((id) => ({ id, name: `홍${id}/AX팀`, email: `hong.${id}@dreamus.io` })),
    check_up_sessions: [
      { id: 'cs1', champion_user_id: 'u1', season_id: 's2', session_date: '2026-10-05', session_time: '10:00:00', title: 't', created_at: '2026-10-05T01:00:00Z' },
      { id: 'cs-old', champion_user_id: 'u1', season_id: 's1', session_date: '2026-07-05', session_time: null, title: 't', created_at: '2026-07-05T01:00:00Z' },
    ],
    one_on_one_bookings: [
      { id: 'b1', champion_user_id: 'u1', slot_start: '2026-10-30T05:00:00Z', slot_end: '2026-10-30T05:30:00Z', status: 'confirmed', confirmed_by: 'claud', created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' },
      { id: 'b-dropped', champion_user_id: 'dropped', slot_start: '2026-10-30T05:00:00Z', slot_end: '2026-10-30T05:30:00Z', status: 'pending', confirmed_by: null, created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z' },
    ],
  }
}

describe('fetchOneOnOneOverview', () => {
  it('현재 시즌이 없으면 빈 결과', async () => {
    const { supabase, calls } = createSupabaseMock({ seasons: [season1] })
    const result = await fetchOneOnOneOverview(supabase, undefined, NOW)
    expect(result).toEqual({
      season: null,
      rows: [],
      startDateMissing: false,
      slack: { enabled: false, error: false, unmapped: [] },
    })
    expect(calls.map((c) => c.table)).toEqual(['seasons'])
  })

  it('현재 시즌 챔피언만, dropped·partner 제외, 이름 파싱', async () => {
    const { supabase } = createSupabaseMock(baseTables(2))
    const result = await fetchOneOnOneOverview(supabase, undefined, NOW)
    expect(result.season?.id).toBe('s2')
    expect(result.startDateMissing).toBe(false)
    expect(result.rows.map((r) => r.userId).sort()).toEqual(['u1', 'u2'])
    const u1 = result.rows.find((r) => r.userId === 'u1')!
    expect(u1).toMatchObject({ name: '홍u1', department: 'AX팀', sessionCount: 1 })
    expect(u1.nextBooking?.id).toBe('b1')
  })

  it('세션 쿼리는 season_id로 필터한다', async () => {
    const { supabase, calls } = createSupabaseMock(baseTables(1))
    const result = await fetchOneOnOneOverview(supabase, undefined, NOW)
    const sessionCall = calls.find((c) => c.table === 'check_up_sessions')!
    expect(sessionCall.filters).toContainEqual({ op: 'eq', field: 'season_id', value: 's2' })
    expect(result.rows[0].sessionCount).toBe(1)
  })

  it('seasonId를 주면 그 시즌을 조회하고, start_date null이면 startDateMissing', async () => {
    const tables = baseTables(1)
    const S1 = '11111111-1111-4111-8111-111111111111'
    tables.seasons = [season2, { ...season1, id: S1 }]
    tables.season_enrollments.push(enrollment('u1', { season_id: S1 }))
    tables.check_up_sessions = tables.check_up_sessions.map((r) => (r.season_id === 's1' ? { ...r, season_id: S1 } : r))
    const { supabase, calls } = createSupabaseMock(tables)
    const result = await fetchOneOnOneOverview(supabase, S1, NOW)
    expect(result.season?.id).toBe(S1)
    expect(result.startDateMissing).toBe(true)
    expect(calls[0].filters).toContainEqual({ op: 'eq', field: 'id', value: S1 })
    // closed 시즌이라도 명단은 보인다
    expect(result.rows.map((r) => r.userId)).toEqual(['u1'])
    expect(result.rows[0].lastSession?.id).toBe('cs-old')
  })

  it('쿼리 수는 챔피언 수와 무관', async () => {
    const a = createSupabaseMock(baseTables(1))
    await fetchOneOnOneOverview(a.supabase, undefined, NOW)
    const b = createSupabaseMock(baseTables(25))
    const result = await fetchOneOnOneOverview(b.supabase, undefined, NOW)
    expect(result.rows).toHaveLength(25)
    expect(b.calls.length).toBe(a.calls.length)
    expect(b.calls.length).toBe(7) // seasons, 종료일 보정용 seasons, enrollments, users, recap 채널(users), sessions, bookings
  })

  it('챔피언이 없으면 후속 쿼리 없이 빈 행', async () => {
    const { supabase, calls } = createSupabaseMock({ seasons: [season2], season_enrollments: [] })
    const result = await fetchOneOnOneOverview(supabase, undefined, NOW)
    expect(result.rows).toEqual([])
    expect(calls.map((c) => c.table)).toEqual(['seasons', 'seasons', 'season_enrollments'])
  })

  it('end_date가 없으면 다음 시즌 시작 전날까지로 예약을 자른다', async () => {
    const S1 = '11111111-1111-4111-8111-111111111111'
    const tables = baseTables(1)
    tables.seasons = [season2, { ...season1, id: S1, start_date: '2026-03-01' }]
    tables.season_enrollments.push(enrollment('u1', { season_id: S1 }))
    tables.one_on_one_bookings = [
      { id: 'b-s1', champion_user_id: 'u1', slot_start: '2026-06-10T05:00:00Z', slot_end: '2026-06-10T05:30:00Z', status: 'confirmed', confirmed_by: 'claud', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-02T00:00:00Z' },
      { id: 'b-s2', champion_user_id: 'u1', slot_start: '2026-10-30T05:00:00Z', slot_end: '2026-10-30T05:30:00Z', status: 'confirmed', confirmed_by: 'claud', created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' },
    ]
    const { supabase } = createSupabaseMock(tables)
    const result = await fetchOneOnOneOverview(supabase, S1, NOW)
    const ids = result.rows[0].timeline.filter((e) => e.kind === 'booking_requested').map((e) => (e as { bookingId: string }).bookingId)
    expect(ids).toEqual(['b-s1'])
  })

  it('UUID가 아닌 season 값은 현재 시즌으로 대체한다', async () => {
    const { supabase } = createSupabaseMock(baseTables(1))
    const result = await fetchOneOnOneOverview(supabase, 'abc', NOW)
    expect(result.season?.id).toBe('s2')
  })

  it('recap 채널 ID를 행에 싣는다(없으면 null)', async () => {
    const tables = baseTables(2)
    tables.users = tables.users.map((u) => (u.id === 'u1' ? { ...u, recap_slack_channel_id: 'C0123ABCD' } : u))
    const { supabase } = createSupabaseMock(tables)
    const result = await fetchOneOnOneOverview(supabase, undefined, NOW)
    expect(result.rows.find((r) => r.userId === 'u1')!.recapChannelId).toBe('C0123ABCD')
    expect(result.rows.find((r) => r.userId === 'u2')!.recapChannelId).toBeNull()
  })

  it('recap 채널 컬럼이 없어도(마이그레이션 전) 페이지는 그대로 뜨고 미설정으로 본다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = createSupabaseMock(baseTables(2), (table, columns) =>
      table === 'users' && columns.includes('recap_slack_channel_id')
        ? { code: '42703', message: 'column users.recap_slack_channel_id does not exist' }
        : null,
    )
    const result = await fetchOneOnOneOverview(supabase, undefined, NOW)
    expect(result.rows).toHaveLength(2)
    expect(result.rows.every((r) => r.recapChannelId === null)).toBe(true)
    expect(result.rows.find((r) => r.userId === 'u1')).toMatchObject({ name: '홍u1', sessionCount: 1 })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  describe('Slack 봇 예약 합치기', () => {
    function srow(over: Partial<SchedulerBookingRow> = {}): SchedulerBookingRow {
      return {
        id: 'r1',
        user_slack_id: 'U_U1',
        user_name: '홍u1',
        selected_slots: [{ start: '2026-10-28T05:00:00Z', end: '2026-10-28T05:30:00Z', available_admins: ['claud'] }],
        status: 'pending',
        confirmed_by: null,
        confirmed_slot: null,
        created_at: '2026-10-21T00:00:00Z',
        ...over,
      }
    }
    const fakeSource = (rows: SchedulerBookingRow[]): SchedulerSource => ({ fetchBookings: async () => rows })
    const emails: Record<string, string | null> = {
      U_U1: '  Hong.U1@Dreamus.IO ',
      U_U2: 'hong.u2@dreamus.io',
      U_OTHER: 'someone@gmail.com',
    }
    const fakeLookup = vi.fn(async (id: string) => {
      if (id === 'U_BAD') throw new Error('user_not_found')
      return emails[id] ?? null
    })

    it('이메일(대소문자·공백 무시)로 챔피언에 매핑해 대기·다음 미팅·취소·타임라인에 반영한다', async () => {
      const { supabase } = createSupabaseMock(baseTables(2))
      const scheduler = fakeSource([
        srow(),
        srow({
          id: 'r2',
          user_slack_id: 'U_U2',
          status: 'confirmed',
          confirmed_by: 'jennifer',
          confirmed_slot: { start: '2026-10-29T05:00:00Z', end: '2026-10-29T06:00:00Z', available_admins: ['jennifer'] },
        }),
        srow({ id: 'r3', status: 'cancelled' }),
        srow({ id: 'r4', status: 'expired' }),
      ])
      const result = await fetchOneOnOneOverview(supabase, undefined, NOW, { scheduler, lookupSlackEmail: fakeLookup })
      expect(result.slack).toEqual({ enabled: true, error: false, unmapped: [] })
      const u1 = result.rows.find((r) => r.userId === 'u1')!
      expect(u1.pendingBooking).toMatchObject({ id: 'slack:r1', source: 'slack', champion_user_id: 'u1' })
      expect(u1.nextBooking?.id).toBe('b1') // 웹 예약 유지
      expect(u1.cancelledCount).toBe(1)
      const slackEvents = u1.timeline.filter((e) => e.kind !== 'session' && e.source === 'slack')
      expect(slackEvents.map((e) => e.kind)).toEqual(['booking_requested', 'booking_requested', 'booking_cancelled'])
      const u2 = result.rows.find((r) => r.userId === 'u2')!
      expect(u2.nextBooking).toMatchObject({ id: 'slack:r2', confirmed_by: 'jennifer', source: 'slack' })
    })

    it('매핑 안 된 Slack 신청은 unmapped로(시즌 기간 안만), 개별 조회 실패도 unmapped', async () => {
      const { supabase } = createSupabaseMock(baseTables(1))
      const scheduler = fakeSource([
        srow({ id: 'o1', user_slack_id: 'U_OTHER', user_name: '외부인' }),
        srow({ id: 'o2', user_slack_id: 'U_BAD', user_name: '조회실패' }),
        srow({
          id: 'o-old',
          user_slack_id: 'U_OTHER',
          selected_slots: [{ start: '2026-06-01T05:00:00Z', end: '2026-06-01T05:30:00Z' }],
        }),
        srow({ id: 'r1' }),
      ])
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await fetchOneOnOneOverview(supabase, undefined, NOW, { scheduler, lookupSlackEmail: fakeLookup })
      spy.mockRestore()
      expect(result.slack.error).toBe(false)
      expect(result.slack.unmapped).toEqual([
        { id: 'slack:o1', userName: '외부인', status: 'pending', slotStart: '2026-10-28T05:00:00Z', createdAt: '2026-10-21T00:00:00Z' },
        { id: 'slack:o2', userName: '조회실패', status: 'pending', slotStart: '2026-10-28T05:00:00Z', createdAt: '2026-10-21T00:00:00Z' },
      ])
      expect(result.rows[0].pendingBooking?.id).toBe('slack:r1')
    })

    it('시즌 기간 밖 Slack 예약은 집계에서 빠진다', async () => {
      const { supabase } = createSupabaseMock(baseTables(1))
      const scheduler = fakeSource([
        srow({
          id: 'old',
          status: 'confirmed',
          confirmed_slot: { start: '2026-09-10T05:00:00Z', end: '2026-09-10T05:30:00Z' },
        }),
      ])
      const result = await fetchOneOnOneOverview(supabase, undefined, NOW, { scheduler, lookupSlackEmail: fakeLookup })
      const ids = result.rows[0].timeline.flatMap((e) => (e.kind === 'session' ? [] : [e.bookingId]))
      expect(ids).not.toContain('slack:old')
      expect(result.rows[0].flags.missingRecord).toBe(false)
    })

    it('지난 Slack 확정 예약에 세션 기록이 없으면 누락 의심', async () => {
      const { supabase } = createSupabaseMock(baseTables(1))
      const scheduler = fakeSource([
        srow({
          id: 'past',
          status: 'confirmed',
          confirmed_by: 'claud',
          confirmed_slot: { start: '2026-10-15T05:00:00Z', end: '2026-10-15T05:30:00Z' },
        }),
      ])
      const result = await fetchOneOnOneOverview(supabase, undefined, NOW, { scheduler, lookupSlackEmail: fakeLookup })
      expect(result.rows[0].flags.missingRecord).toBe(true)
    })

    it('스케줄러 조회 실패 시 throw하지 않고 error 플래그 + 웹 예약 유지', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { supabase } = createSupabaseMock(baseTables(1))
      const scheduler: SchedulerSource = {
        fetchBookings: async () => {
          throw new Error('scheduler down')
        },
      }
      const result = await fetchOneOnOneOverview(supabase, undefined, NOW, { scheduler, lookupSlackEmail: fakeLookup })
      spy.mockRestore()
      expect(result.slack).toEqual({ enabled: true, error: true, unmapped: [] })
      expect(result.rows[0].nextBooking?.id).toBe('b1')
    })

    it('Slack 조회가 전부 실패하면 error 플래그(예약은 미매핑으로 남음)', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { supabase } = createSupabaseMock(baseTables(1))
      const result = await fetchOneOnOneOverview(supabase, undefined, NOW, {
        scheduler: fakeSource([srow()]),
        lookupSlackEmail: async () => {
          throw new Error('invalid_auth')
        },
      })
      spy.mockRestore()
      expect(result.slack.error).toBe(true)
      expect(result.slack.unmapped).toHaveLength(1)
      expect(result.rows[0].pendingBooking).toBeNull()
    })

    it('스케줄러 env가 없으면 기능을 끈다(enabled=false, 배너 없음)', async () => {
      const { supabase } = createSupabaseMock(baseTables(1))
      const result = await fetchOneOnOneOverview(supabase, undefined, NOW)
      expect(result.slack).toEqual({ enabled: false, error: false, unmapped: [] })
    })

    it('Slack 예약을 합쳐도 supabase 쿼리 수는 그대로이고 users는 email을 읽는다', async () => {
      const a = createSupabaseMock(baseTables(3))
      await fetchOneOnOneOverview(a.supabase, undefined, NOW, { scheduler: null })
      const b = createSupabaseMock(baseTables(3))
      await fetchOneOnOneOverview(b.supabase, undefined, NOW, {
        scheduler: fakeSource([srow(), srow({ id: 'x', user_slack_id: 'U_OTHER' })]),
        lookupSlackEmail: fakeLookup,
      })
      expect(b.calls.length).toBe(a.calls.length)
      expect(b.calls.length).toBe(7)
      const usersSelect = (b.supabase.from as ReturnType<typeof vi.fn>).mock.results
        .filter((_, i) => b.calls[i].table === 'users')
        .map((r) => (r.value.select as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
      expect(usersSelect.some((c) => c.includes('email'))).toBe(true)
    })
  })
})
