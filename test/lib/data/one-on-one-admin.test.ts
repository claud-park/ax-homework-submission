import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOneOnOneOverview } from '@/lib/data/one-on-one-admin'

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
    users: [...ids, 'dropped', 'partner'].map((id) => ({ id, name: `홍${id}/AX팀` })),
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
    expect(result).toEqual({ season: null, rows: [], startDateMissing: false })
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
})
