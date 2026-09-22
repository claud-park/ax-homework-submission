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
} from '@/lib/data/seasons-admin'

function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
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
    const supabase = createSupabaseMock({})
    await activateSeason(supabase, 's2')
    expect(supabase.rpc).toHaveBeenCalledWith('activate_season', { p_new_season_id: 's2' })
  })

  it('throws when the RPC fails', async () => {
    const supabase = {
      from: vi.fn(),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'rpc failed' } })),
    } as unknown as SupabaseClient
    await expect(activateSeason(supabase, 's2')).rejects.toThrow('rpc failed')
  })
})
