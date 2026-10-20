import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  listSeasons,
  createSeason,
  getPreviousSeasonRoster,
  getSeasonEnrollments,
  getUnassignedUsers,
  assignEnrollments,
  activateSeason,
  promoteEnrolledViewers,
} from '@/lib/data/seasons-admin'

function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => void) => resolve(result),
  }
  return builder
}

function createSupabaseMock(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    from: vi.fn((table: string) => createQueryBuilder(responses[table])),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  } as unknown as SupabaseClient
}

describe('listSeasons', () => {
  it('returns seasons ordered by created_at desc', async () => {
    const seasons = [{ id: 's2', name: '시즌 2' }, { id: 's1', name: '시즌 1' }]
    const supabase = createSupabaseMock({ seasons: { data: seasons, error: null } })
    expect(await listSeasons(supabase)).toEqual(seasons)
  })

  it('returns an empty array on error', async () => {
    const supabase = createSupabaseMock({ seasons: { data: null, error: { message: 'boom' } } })
    expect(await listSeasons(supabase)).toEqual([])
  })
})

describe('createSeason', () => {
  it('inserts a season with recruiting status and is_current false', async () => {
    const created = { id: 's2', name: '시즌 2', status: 'recruiting', is_current: false }
    const supabase = createSupabaseMock({ seasons: { data: created, error: null } })
    expect(await createSeason(supabase, { name: '시즌 2', startDate: null })).toEqual(created)
  })

  it('throws when the insert fails', async () => {
    const supabase = createSupabaseMock({ seasons: { data: null, error: { message: 'insert failed' } } })
    await expect(createSeason(supabase, { name: '시즌 2', startDate: null })).rejects.toThrow('insert failed')
  })
})

describe('getPreviousSeasonRoster', () => {
  it('joins season_enrollments with user names', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: {
        data: [{ id: 'e1', user_id: 'u1', role_in_season: 'champion', status: 'completed' }],
        error: null,
      },
      users: { data: [{ id: 'u1', name: '홍길동' }], error: null },
    })
    expect(await getPreviousSeasonRoster(supabase, 's1')).toEqual([
      { userId: 'u1', name: '홍길동', roleInSeason: 'champion', enrollmentStatus: 'completed', enrollmentId: 'e1' },
    ])
  })

  it('returns an empty array when there are no enrollments', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: { data: [], error: null },
      users: { data: [], error: null },
    })
    expect(await getPreviousSeasonRoster(supabase, 's1')).toEqual([])
  })
})

describe('getSeasonEnrollments', () => {
  it('joins season_enrollments with user names for a given season', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: { data: [{ user_id: 'u1', role_in_season: 'partner' }], error: null },
      users: { data: [{ id: 'u1', name: '김철수' }], error: null },
    })
    expect(await getSeasonEnrollments(supabase, 's2')).toEqual([
      { userId: 'u1', name: '김철수', roleInSeason: 'partner' },
    ])
  })
})

describe('getUnassignedUsers', () => {
  it('excludes users already enrolled in the season', async () => {
    const supabase = createSupabaseMock({
      users: { data: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }], error: null },
      season_enrollments: { data: [{ user_id: 'u1' }], error: null },
    })
    expect(await getUnassignedUsers(supabase, 's2')).toEqual([{ userId: 'u2', name: 'B' }])
  })

  it('also excludes ids passed via excludeUserIds, even if not in season_enrollments', async () => {
    const supabase = createSupabaseMock({
      users: { data: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }, { id: 'u3', name: 'C' }], error: null },
      season_enrollments: { data: [{ user_id: 'u1' }], error: null },
    })
    expect(await getUnassignedUsers(supabase, 's2', ['u2'])).toEqual([{ userId: 'u3', name: 'C' }])
  })
})

describe('assignEnrollments', () => {
  it('upserts one row per assignment', async () => {
    const builder = createQueryBuilder({ data: [{ id: 'e1' }], error: null })
    const supabase = {
      from: vi.fn(() => builder),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    } as unknown as SupabaseClient

    await expect(
      assignEnrollments(supabase, 's2', [{ userId: 'u1', roleInSeason: 'champion', continueFromEnrollmentId: 'e0' }]),
    ).resolves.toBeUndefined()

    expect(builder.upsert).toHaveBeenCalledWith(
      [
        {
          season_id: 's2',
          user_id: 'u1',
          role_in_season: 'champion',
          status: 'active',
          continued_from_enrollment_id: 'e0',
        },
      ],
      { onConflict: 'season_id,user_id' },
    )
  })

  it('throws when the upsert fails', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: { data: null, error: { message: 'upsert failed' } },
    })
    await expect(
      assignEnrollments(supabase, 's2', [{ userId: 'u1', roleInSeason: 'champion' }]),
    ).rejects.toThrow('upsert failed')
  })

  it('upserts multiple rows in one call, each mapped independently', async () => {
    const builder = createQueryBuilder({ data: [{ id: 'e1' }, { id: 'e2' }], error: null })
    const supabase = {
      from: vi.fn(() => builder),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    } as unknown as SupabaseClient
    await assignEnrollments(supabase, 's2', [
      { userId: 'u1', roleInSeason: 'champion', continueFromEnrollmentId: 'e0' },
      { userId: 'u2', roleInSeason: 'partner' },
    ])
    expect(builder.upsert).toHaveBeenCalledWith(
      [
        { season_id: 's2', user_id: 'u1', role_in_season: 'champion', status: 'active', continued_from_enrollment_id: 'e0' },
        { season_id: 's2', user_id: 'u2', role_in_season: 'partner', status: 'active', continued_from_enrollment_id: null },
      ],
      { onConflict: 'season_id,user_id' },
    )
  })

  it('does not throw when given an empty assignments array', async () => {
    const builder = createQueryBuilder({ data: [], error: null })
    const supabase = {
      from: vi.fn(() => builder),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    } as unknown as SupabaseClient
    await expect(assignEnrollments(supabase, 's2', [])).resolves.toBeUndefined()
    expect(builder.upsert).toHaveBeenCalledWith([], { onConflict: 'season_id,user_id' })
  })
})

describe('activateSeason', () => {
  it('calls the activate_season RPC with the new season id', async () => {
    const supabase = createSupabaseMock({ season_enrollments: { data: [], error: null } })
    await activateSeason(supabase, 's2')
    expect(supabase.rpc).toHaveBeenCalledWith('activate_season', { p_new_season_id: 's2' })
  })

  it('promotes enrolled viewers after the RPC succeeds', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: { data: [{ user_id: 'u1', role_in_season: 'champion' }], error: null },
      users: { data: [{ id: 'u1' }], error: null },
    })
    await activateSeason(supabase, 's2')
    const usersCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'users')
    expect(usersCalls).toHaveLength(2) // viewer 조회 + champion 승격
  })

  it('does not throw when promotion fails after a successful RPC', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: { data: null, error: { message: 'select failed' } },
    })
    await expect(activateSeason(supabase, 's2')).resolves.toBeUndefined()
  })

  it('throws when the RPC fails', async () => {
    const supabase = {
      from: vi.fn(),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'rpc failed' } })),
    } as unknown as SupabaseClient
    await expect(activateSeason(supabase, 's2')).rejects.toThrow('rpc failed')
  })
})

describe('promoteEnrolledViewers', () => {
  it('returns 0 and skips users lookup when the season has no active enrollments', async () => {
    const supabase = createSupabaseMock({ season_enrollments: { data: [], error: null } })
    expect(await promoteEnrolledViewers(supabase, 's2')).toBe(0)
    expect(supabase.from).not.toHaveBeenCalledWith('users')
  })

  it('promotes only viewers, grouped by role', async () => {
    const builders: Record<string, unknown>[] = []
    const responses: Record<string, { data: unknown; error: unknown }> = {
      season_enrollments: {
        data: [
          { user_id: 'u1', role_in_season: 'champion' },
          { user_id: 'u2', role_in_season: 'partner' },
          { user_id: 'u3', role_in_season: 'champion' }, // 이미 champion → viewer 조회에 안 나옴
        ],
        error: null,
      },
      users: { data: [{ id: 'u1' }, { id: 'u2' }], error: null },
    }
    const supabase = {
      from: vi.fn((table: string) => { const b = createQueryBuilder(responses[table]); builders.push(b); return b }),
      rpc: vi.fn(),
    } as unknown as SupabaseClient
    expect(await promoteEnrolledViewers(supabase, 's2')).toBe(2)
    const updates = builders.filter((b) => (b.update as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    expect(updates).toHaveLength(2)
    expect(updates[0].update).toHaveBeenCalledWith({ user_group: 'champion' })
    expect(updates[0].in).toHaveBeenCalledWith('id', ['u1'])
    expect(updates[1].update).toHaveBeenCalledWith({ user_group: 'partner' })
    expect(updates[1].in).toHaveBeenCalledWith('id', ['u2'])
  })

  it('throws when the enrollments query fails', async () => {
    const supabase = createSupabaseMock({ season_enrollments: { data: null, error: { message: 'boom' } } })
    await expect(promoteEnrolledViewers(supabase, 's2')).rejects.toThrow('boom')
  })
})
