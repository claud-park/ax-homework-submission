import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getCurrentSeasonId,
  getCurrentSeasonUserIds,
  isEnrolledInCurrentSeason,
  requireCurrentSeasonIdForWrite,
  getSeasonIdForCheckUpSession,
} from '@/lib/data/season'

function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const filters: { field: string; op: 'eq' | 'neq'; value: unknown }[] = []

  const applyFilters = (r: { data: unknown; error: unknown }) => {
    if (!Array.isArray(r.data)) return r
    const filtered = (r.data as Record<string, unknown>[]).filter((row) =>
      filters.every((f) => {
        if (!(f.field in row)) return true
        return f.op === 'eq' ? row[f.field] === f.value : row[f.field] !== f.value
      }),
    )
    return { ...r, data: filtered }
  }

  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn((field: string, value: unknown) => {
      filters.push({ field, op: 'eq', value })
      return builder
    }),
    neq: vi.fn((field: string, value: unknown) => {
      filters.push({ field, op: 'neq', value })
      return builder
    }),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => void) => resolve(applyFilters(result)),
  }
  return builder
}

function createSupabaseMock(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    from: vi.fn((table: string) => createQueryBuilder(responses[table])),
  } as unknown as SupabaseClient
}

describe('getCurrentSeasonId', () => {
  it('returns the current season id when one exists', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
    })
    expect(await getCurrentSeasonId(supabase)).toBe('season-2')
  })

  it('returns null when no season is marked current', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: null, error: null },
    })
    expect(await getCurrentSeasonId(supabase)).toBeNull()
  })
})

describe('getCurrentSeasonUserIds', () => {
  it('returns user ids enrolled in the current season with the given role', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
      season_enrollments: { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null },
    })
    expect(await getCurrentSeasonUserIds(supabase, 'champion')).toEqual(['u1', 'u2'])
  })

  it('returns an empty array when there is no current season', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: null, error: null },
      season_enrollments: { data: null, error: null },
    })
    expect(await getCurrentSeasonUserIds(supabase, 'champion')).toEqual([])
  })

  it('keeps completed enrollments but excludes dropped ones', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
      season_enrollments: {
        data: [
          { user_id: 'u1', status: 'completed' },
          { user_id: 'u2', status: 'dropped' },
        ],
        error: null,
      },
    })
    expect(await getCurrentSeasonUserIds(supabase, 'champion')).toEqual(['u1'])
  })
})

describe('isEnrolledInCurrentSeason', () => {
  it('returns true when the user has an active enrollment for the role', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
      season_enrollments: { data: { id: 'enrollment-1' }, error: null },
    })
    expect(await isEnrolledInCurrentSeason(supabase, 'u1', 'champion')).toBe(true)
  })

  it('returns false when the user has no matching enrollment', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
      season_enrollments: { data: null, error: null },
    })
    expect(await isEnrolledInCurrentSeason(supabase, 'u1', 'champion')).toBe(false)
  })
})

describe('requireCurrentSeasonIdForWrite', () => {
  it('returns the season id when a current season exists', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
    })
    expect(await requireCurrentSeasonIdForWrite(supabase)).toBe('season-2')
  })

  it('throws when there is no current season', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: null, error: null },
    })
    await expect(requireCurrentSeasonIdForWrite(supabase)).rejects.toThrow(
      '현재 시즌이 설정되지 않았습니다',
    )
  })
})

describe('getSeasonIdForCheckUpSession', () => {
  it('returns the season_id when the session exists', async () => {
    const supabase = createSupabaseMock({
      check_up_sessions: { data: { season_id: 'season-2' }, error: null },
    })
    expect(await getSeasonIdForCheckUpSession(supabase, 'session-1')).toBe('season-2')
  })

  it('returns null when the session does not exist', async () => {
    const supabase = createSupabaseMock({
      check_up_sessions: { data: null, error: null },
    })
    expect(await getSeasonIdForCheckUpSession(supabase, 'session-1')).toBeNull()
  })
})
