import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findPreviousCharterId, isOwnCurrentSeasonCharter } from '@/lib/data/charter-lineage'

function createMock(result: { data: unknown; error: unknown }) {
  const b: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of ['select', 'eq', 'neq', 'order', 'limit']) b[m] = vi.fn(() => b)
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  return { client: { from: vi.fn(() => b) } as unknown as SupabaseClient, b }
}

describe('findPreviousCharterId', () => {
  it('returns the latest published charter from another season', async () => {
    const { client, b } = createMock({ data: { id: 'c-old' }, error: null })
    expect(await findPreviousCharterId(client, 'u1', 's2')).toBe('c-old')
    expect(b.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(b.neq).toHaveBeenCalledWith('season_id', 's2')
    expect(b.eq).toHaveBeenCalledWith('publish_status', 'published')
    expect(b.order).toHaveBeenCalledWith('submitted_at', { ascending: false })
  })

  it('returns null when there is no previous charter', async () => {
    const { client } = createMock({ data: null, error: null })
    expect(await findPreviousCharterId(client, 'u1', 's2')).toBeNull()
  })

  it('returns null (not throw) on query error', async () => {
    const { client } = createMock({ data: null, error: { message: 'boom' } })
    expect(await findPreviousCharterId(client, 'u1', 's2')).toBeNull()
  })
})

describe('isOwnCurrentSeasonCharter', () => {
  it('is true only when a row matches id + user + current season', async () => {
    const { client, b } = createMock({ data: { id: 'c1' }, error: null })
    expect(await isOwnCurrentSeasonCharter(client, 'c1', 'u1', 's2')).toBe(true)
    expect(b.eq).toHaveBeenCalledWith('id', 'c1')
    expect(b.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(b.eq).toHaveBeenCalledWith('season_id', 's2')
  })
  it('is false when no row matches (other user or past season)', async () => {
    const { client } = createMock({ data: null, error: null })
    expect(await isOwnCurrentSeasonCharter(client, 'c-old', 'u1', 's2')).toBe(false)
  })
  it('is false (fail-closed) on query error', async () => {
    const { client } = createMock({ data: null, error: { message: 'boom' } })
    expect(await isOwnCurrentSeasonCharter(client, 'c1', 'u1', 's2')).toBe(false)
  })
})
