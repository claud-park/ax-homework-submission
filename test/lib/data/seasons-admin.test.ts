import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listSeasons, createSeason } from '@/lib/data/seasons-admin'

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
