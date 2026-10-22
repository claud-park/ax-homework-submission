import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const requireAdmin = vi.fn()
const postRecapDraft = vi.fn()
const supabaseStub = { stub: true }

vi.mock('@/lib/api/guard', () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => supabaseStub }))
vi.mock('@/lib/recap/postDraft', () => ({ postRecapDraft: (...a: unknown[]) => postRecapDraft(...a) }))

import { POST } from '@/app/api/sessions/[sessionId]/recap-draft/route'

const req = {} as never
const params = { params: { sessionId: 's1' } }

beforeEach(() => {
  requireAdmin.mockReset()
  postRecapDraft.mockReset()
})

describe('POST /api/sessions/[sessionId]/recap-draft', () => {
  it('re-posts with refuseIfSent and returns ok', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin' })
    postRecapDraft.mockResolvedValue({ posted: true })
    const res = await POST(req, params)
    expect(postRecapDraft).toHaveBeenCalledWith({ supabase: supabaseStub, refuseIfSent: true }, 's1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns reason and errorCode on failure', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin' })
    postRecapDraft.mockResolvedValue({ posted: false, reason: 'slack_error', errorCode: 'channel_not_found' })
    const res = await POST(req, params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, reason: 'slack_error', errorCode: 'channel_not_found' })
  })

  it('returns reason only when there is no errorCode', async () => {
    requireAdmin.mockResolvedValue({ id: 'admin' })
    postRecapDraft.mockResolvedValue({ posted: false, reason: 'already_sent' })
    const res = await POST(req, params)
    expect(await res.json()).toEqual({ ok: false, reason: 'already_sent' })
  })

  it('returns the guard response as is and does not post', async () => {
    const forbidden = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    requireAdmin.mockResolvedValue(forbidden)
    const res = await POST(req, params)
    expect(res).toBe(forbidden)
    expect(postRecapDraft).not.toHaveBeenCalled()
  })
})
