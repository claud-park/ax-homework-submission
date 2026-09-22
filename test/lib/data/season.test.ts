import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurrentSeasonId, getCurrentSeasonUserIds, isEnrolledInCurrentSeason } from '@/lib/data/season'

function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => void) => resolve(result),
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
