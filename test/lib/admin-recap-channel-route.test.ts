import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const requireAdmin = vi.fn()
type Result = { data: unknown; error: unknown }
let updateResult: Result = { data: { id: 'u1', recap_slack_channel_id: 'C0123ABCD' }, error: null }
const updates: { table: string; patch: Record<string, unknown>; filters: [string, unknown][] }[] = []

const supabaseStub = {
  from(table: string) {
    const rec = { table, patch: {} as Record<string, unknown>, filters: [] as [string, unknown][] }
    const q: Record<string, unknown> = {}
    q.update = (p: Record<string, unknown>) => ((rec.patch = p), updates.push(rec), q)
    q.eq = (k: string, v: unknown) => (rec.filters.push([k, v]), q)
    q.select = () => q
    q.maybeSingle = () => Promise.resolve(updateResult)
    return q
  },
}

vi.mock('@/lib/api/guard', () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => supabaseStub }))

import { PATCH } from '@/app/api/admin/users/[userId]/recap-channel/route'

function req(body: unknown, raw = false) {
  return { json: async () => (raw ? JSON.parse(body as string) : body) } as never
}
const params = { params: { userId: 'u1' } }

beforeEach(() => {
  requireAdmin.mockReset()
  requireAdmin.mockResolvedValue({ id: 'admin' })
  updates.length = 0
  updateResult = { data: { id: 'u1', recap_slack_channel_id: 'C0123ABCD' }, error: null }
})

describe('PATCH /api/admin/users/[userId]/recap-channel', () => {
  it('returns the guard response for non-admins without touching the DB', async () => {
    const forbidden = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    requireAdmin.mockResolvedValue(forbidden)
    const res = await PATCH(req({ channelId: 'C0123ABCD' }), params)
    expect(res).toBe(forbidden)
    expect(updates).toHaveLength(0)
  })

  it('saves a trimmed channel id', async () => {
    const res = await PATCH(req({ channelId: '  C0123ABCD ' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, channelId: 'C0123ABCD' })
    expect(updates[0]).toMatchObject({ table: 'users', patch: { recap_slack_channel_id: 'C0123ABCD' } })
    expect(updates[0].filters).toContainEqual(['id', 'u1'])
  })

  it.each([null, '', '   '])('clears with %j', async (v) => {
    updateResult = { data: { id: 'u1', recap_slack_channel_id: null }, error: null }
    const res = await PATCH(req({ channelId: v }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, channelId: null })
    expect(updates[0].patch).toEqual({ recap_slack_channel_id: null })
  })

  it.each(['c0123abcd', '#general', 'D0123ABCD', 'C12'])('rejects invalid format %j with a Korean 400', async (v) => {
    const res = await PATCH(req({ channelId: v }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/채널 ID 형식/)
    expect(updates).toHaveLength(0)
  })

  it('rejects a missing channelId field and a broken body', async () => {
    expect((await PATCH(req({}), params)).status).toBe(400)
    expect((await PATCH(req('{', true), params)).status).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('returns 404 when the user does not exist', async () => {
    updateResult = { data: null, error: null }
    const res = await PATCH(req({ channelId: 'C0123ABCD' }), params)
    expect(res.status).toBe(404)
  })

  it('returns 503 with a migration message when the column is missing', async () => {
    updateResult = { data: null, error: { code: '42703', message: 'column users.recap_slack_channel_id does not exist' } }
    const res = await PATCH(req({ channelId: 'C0123ABCD' }), params)
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/마이그레이션 적용이 필요합니다/)
  })

  it('returns 500 on other DB errors', async () => {
    updateResult = { data: null, error: { code: '500', message: 'db down' } }
    const res = await PATCH(req({ channelId: 'C0123ABCD' }), params)
    expect(res.status).toBe(500)
  })
})
