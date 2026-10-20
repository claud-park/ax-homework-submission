import { describe, it, expect } from 'vitest'
import { normalizeInviteEmails, partitionInviteEmails } from '@/lib/data/season-invites'

describe('normalizeInviteEmails', () => {
  it('splits on newline/comma/semicolon/space, trims, lowercases, dedupes', () => {
    expect(normalizeInviteEmails(' A.B@Dreamus.io, c@dreamus.io\nC@DREAMUS.IO; d@dreamus.io  '))
      .toEqual(['a.b@dreamus.io', 'c@dreamus.io', 'd@dreamus.io'])
  })

  it('returns [] for blank input', () => {
    expect(normalizeInviteEmails('  \n ')).toEqual([])
  })
})

describe('partitionInviteEmails', () => {
  it('rejects malformed and off-domain emails when a domain is set', () => {
    expect(partitionInviteEmails(['a@dreamus.io', 'nope', 'b@gmail.com'], 'dreamus.io'))
      .toEqual({ valid: ['a@dreamus.io'], invalid: ['nope', 'b@gmail.com'] })
  })

  it('matches the allowed domain case-insensitively', () => {
    expect(partitionInviteEmails(['a@dreamus.io'], 'DREAMUS.IO')).toEqual({ valid: ['a@dreamus.io'], invalid: [] })
  })

  it('accepts any domain when allowedDomain is undefined', () => {
    expect(partitionInviteEmails(['b@gmail.com'], undefined)).toEqual({ valid: ['b@gmail.com'], invalid: [] })
  })
})

// ─── DB 함수 ────────────────────────────────────────────────────────────────
import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  listSeasonInvites,
  applyPendingInvitesForUser,
  createSeasonInvites,
  deleteSeasonInvite,
  resolvePromotedGroup,
} from '@/lib/data/season-invites'

type Result = { data: unknown; error: unknown }
type Builder = Record<string, ReturnType<typeof vi.fn>> & { calls: unknown[][] }

const CHAIN = ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'is', 'in', 'order'] as const

function createBuilder(result: Result): Builder {
  const calls: unknown[][] = []
  const b = { calls } as Builder
  for (const m of CHAIN) b[m] = vi.fn((...args: unknown[]) => { calls.push([m, ...args]); return b })
  b.single = vi.fn(() => Promise.resolve(result))
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  ;(b as unknown as { then: (r: (v: unknown) => void) => void }).then = (resolve) => resolve(result)
  return b
}

/** from(table) 호출 순서대로 queues[table]의 결과를 하나씩 꺼내 쓰는 mock. */
function createSupabaseMock(queues: Record<string, Result[]>) {
  const builders: Record<string, Builder[]> = {}
  const client = {
    from: vi.fn((table: string) => {
      const result = queues[table]?.shift() ?? { data: null, error: null }
      const b = createBuilder(result)
      ;(builders[table] ??= []).push(b)
      return b
    }),
  } as unknown as SupabaseClient
  return { client, builders }
}

const ok = (data: unknown): Result => ({ data, error: null })

describe('listSeasonInvites', () => {
  it('returns invites for the season', async () => {
    const rows = [{ id: 'i1', email: 'a@dreamus.io' }]
    const { client } = createSupabaseMock({ season_invites: [ok(rows)] })
    expect(await listSeasonInvites(client, 's2')).toEqual(rows)
  })

  it('returns [] on error', async () => {
    const { client } = createSupabaseMock({ season_invites: [{ data: null, error: { message: 'boom' } }] })
    expect(await listSeasonInvites(client, 's2')).toEqual([])
  })
})

describe('applyPendingInvitesForUser', () => {
  it('creates one enrollment per pending invite, promotes viewer to champion, consumes invites', async () => {
    const invites = [
      { id: 'i1', season_id: 'sA', email: 'a@dreamus.io', role_in_season: 'champion' },
      { id: 'i2', season_id: 'sB', email: 'a@dreamus.io', role_in_season: 'partner' },
    ]
    const { client, builders } = createSupabaseMock({
      season_invites: [ok(invites), ok(null)],
      season_enrollments: [ok(null)],
      seasons: [ok({ id: 'sA' })],
      users: [ok({ user_group: 'viewer' }), ok(null)],
    })
    expect(await applyPendingInvitesForUser(client, 'u1', 'a@dreamus.io')).toEqual({ applied: 2 })

    expect(builders.season_enrollments[0].upsert).toHaveBeenCalledWith(
      [
        { season_id: 'sA', user_id: 'u1', role_in_season: 'champion', status: 'active' },
        { season_id: 'sB', user_id: 'u1', role_in_season: 'partner', status: 'active' },
      ],
      { onConflict: 'season_id,user_id', ignoreDuplicates: true },
    )
    expect(builders.users[1].update).toHaveBeenCalledWith({ user_group: 'champion' })
    const consume = builders.season_invites[1]
    expect(consume.update.mock.calls[0][0]).toMatchObject({ consumed_user_id: 'u1' })
    expect(consume.update.mock.calls[0][0].consumed_at).toEqual(expect.any(String))
    expect(consume.in).toHaveBeenCalledWith('id', ['i1', 'i2'])
  })

  it('does not demote an existing champion invited as partner', async () => {
    const invites = [{ id: 'i1', season_id: 'sB', email: 'a@dreamus.io', role_in_season: 'partner' }]
    const { client, builders } = createSupabaseMock({
      season_invites: [ok(invites), ok(null)],
      season_enrollments: [ok(null)],
      seasons: [ok({ id: 'sB' })],
      users: [ok({ user_group: 'champion' })],
    })
    await applyPendingInvitesForUser(client, 'u1', 'a@dreamus.io')
    expect(builders.users).toHaveLength(1) // select만, update 없음
  })

  it('enrolls but does not touch user_group when the invited season is not current', async () => {
    const invites = [{ id: 'i1', season_id: 'sNext', email: 'a@dreamus.io', role_in_season: 'champion' }]
    const { client, builders } = createSupabaseMock({
      season_invites: [ok(invites), ok(null)],
      season_enrollments: [ok(null)],
      seasons: [ok({ id: 'sCurrent' })],
    })
    expect(await applyPendingInvitesForUser(client, 'u1', 'a@dreamus.io')).toEqual({ applied: 1 })
    expect(builders.season_enrollments[0].upsert).toHaveBeenCalled()
    expect(builders.users).toBeUndefined()
    expect(builders.season_invites[1].update.mock.calls[0][0]).toMatchObject({ consumed_user_id: 'u1' })
  })

  it('promotes viewer to partner for a partner invite', async () => {
    const invites = [{ id: 'i1', season_id: 'sB', email: 'a@dreamus.io', role_in_season: 'partner' }]
    const { client, builders } = createSupabaseMock({
      season_invites: [ok(invites), ok(null)],
      season_enrollments: [ok(null)],
      seasons: [ok({ id: 'sB' })],
      users: [ok({ user_group: 'viewer' }), ok(null)],
    })
    await applyPendingInvitesForUser(client, 'u1', 'a@dreamus.io')
    expect(builders.users[1].update).toHaveBeenCalledWith({ user_group: 'partner' })
  })

  it('writes nothing when there are no pending invites', async () => {
    const { client, builders } = createSupabaseMock({ season_invites: [ok([])] })
    expect(await applyPendingInvitesForUser(client, 'u1', 'a@dreamus.io')).toEqual({ applied: 0 })
    expect(builders.season_enrollments).toBeUndefined()
    expect(builders.seasons).toBeUndefined()
    expect(builders.users).toBeUndefined()
    expect(builders.season_invites).toHaveLength(1)
  })

  it('queries by lowercased email and pending only', async () => {
    const { client, builders } = createSupabaseMock({ season_invites: [ok([])] })
    await applyPendingInvitesForUser(client, 'u1', 'A@Dreamus.io')
    expect(builders.season_invites[0].eq).toHaveBeenCalledWith('email', 'a@dreamus.io')
    expect(builders.season_invites[0].is).toHaveBeenCalledWith('consumed_at', null)
  })
})

describe('createSeasonInvites', () => {
  it('skips consumed emails, upserts the rest, and applies immediately for existing users', async () => {
    const emails = ['x@dreamus.io', 'y@dreamus.io', 'z@dreamus.io']
    const { client, builders } = createSupabaseMock({
      season_invites: [
        ok([{ email: 'x@dreamus.io', consumed_at: '2026-10-01T00:00:00Z' }]), // 기존 조회
        ok(null), // upsert
        ok([{ id: 'i-y', season_id: 's2', email: 'y@dreamus.io', role_in_season: 'champion' }]), // y의 pending 조회
        ok(null), // y 소비
      ],
      seasons: [ok({ id: 's2' })],
      users: [
        ok([{ id: 'u-y', email: 'Y@dreamus.io' }]), // 가입자 조회 (대소문자 무시 매칭)
        ok({ user_group: 'viewer' }),
        ok(null),
      ],
      season_enrollments: [ok(null)],
    })
    const result = await createSeasonInvites(client, 's2', emails, 'champion')
    expect(result).toEqual({ created: 2, appliedNow: 1, skippedConsumed: ['x@dreamus.io'], failed: [] })
    // 즉시 적용 경로가 실제로 enrollment/승격/소비까지 수행했는지
    expect(builders.season_enrollments[0].upsert).toHaveBeenCalledWith(
      [{ season_id: 's2', user_id: 'u-y', role_in_season: 'champion', status: 'active' }],
      { onConflict: 'season_id,user_id', ignoreDuplicates: true },
    )
    expect(builders.users[2].update).toHaveBeenCalledWith({ user_group: 'champion' })
    expect(builders.season_invites[3].in).toHaveBeenCalledWith('id', ['i-y'])
    expect(builders.season_invites[1].upsert).toHaveBeenCalledWith(
      [
        { season_id: 's2', email: 'y@dreamus.io', role_in_season: 'champion' },
        { season_id: 's2', email: 'z@dreamus.io', role_in_season: 'champion' },
      ],
      { onConflict: 'season_id,email' },
    )
  })

  it('returns zeros without writing when every email is already consumed', async () => {
    const { client, builders } = createSupabaseMock({
      season_invites: [ok([{ email: 'x@dreamus.io', consumed_at: '2026-10-01T00:00:00Z' }])],
    })
    expect(await createSeasonInvites(client, 's2', ['x@dreamus.io'], 'partner'))
      .toEqual({ created: 0, appliedNow: 0, skippedConsumed: ['x@dreamus.io'], failed: [] })
    expect(builders.season_invites).toHaveLength(1)
  })

  it('isolates a per-user apply failure and reports it in failed', async () => {
    const { client } = createSupabaseMock({
      season_invites: [
        ok([]), // 기존 조회
        ok(null), // upsert
        { data: null, error: { message: 'boom' } }, // a의 pending 조회 실패
        ok([{ id: 'i-b', season_id: 's2', email: 'b@dreamus.io', role_in_season: 'champion' }]), // b pending
        ok(null), // b 소비
      ],
      seasons: [ok({ id: 's2' })],
      users: [
        ok([{ id: 'u-a', email: 'a@dreamus.io' }, { id: 'u-b', email: 'b@dreamus.io' }]),
        ok({ user_group: 'viewer' }),
        ok(null),
      ],
      season_enrollments: [ok(null)],
    })
    expect(await createSeasonInvites(client, 's2', ['a@dreamus.io', 'b@dreamus.io'], 'champion'))
      .toEqual({ created: 2, appliedNow: 1, skippedConsumed: [], failed: ['a@dreamus.io'] })
  })
})

describe('resolvePromotedGroup', () => {
  it('promotes viewer to champion when any role is champion', () => {
    expect(resolvePromotedGroup('viewer', ['partner', 'champion'])).toBe('champion')
  })
  it('promotes viewer to partner for partner-only roles', () => {
    expect(resolvePromotedGroup('viewer', ['partner'])).toBe('partner')
  })
  it('never demotes champion to partner', () => {
    expect(resolvePromotedGroup('champion', ['partner'])).toBeNull()
  })
  it('promotes partner to champion', () => {
    expect(resolvePromotedGroup('partner', ['champion'])).toBe('champion')
  })
  it('returns null when already in the target group or current is unknown', () => {
    expect(resolvePromotedGroup('champion', ['champion'])).toBeNull()
    expect(resolvePromotedGroup(undefined, ['partner'])).toBeNull()
  })
})

describe('deleteSeasonInvite', () => {
  it('deletes a pending invite scoped to the season', async () => {
    const { client, builders } = createSupabaseMock({ season_invites: [ok([{ id: 'i1' }])] })
    await deleteSeasonInvite(client, 's2', 'i1')
    const b = builders.season_invites[0]
    expect(b.delete).toHaveBeenCalled()
    expect(b.eq).toHaveBeenCalledWith('id', 'i1')
    expect(b.eq).toHaveBeenCalledWith('season_id', 's2')
    expect(b.is).toHaveBeenCalledWith('consumed_at', null)
  })

  it('throws when nothing was deleted (already consumed or missing)', async () => {
    const { client } = createSupabaseMock({ season_invites: [ok([])] })
    await expect(deleteSeasonInvite(client, 's2', 'i1')).rejects.toThrow('이미 적용된 초대')
  })
})
