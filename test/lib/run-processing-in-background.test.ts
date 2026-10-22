import { describe, it, expect, vi, beforeEach } from 'vitest'

const processSessionAudio = vi.fn()
const postRecapDraft = vi.fn()
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => void p }))
vi.mock('@/lib/sessions/processAudio', () => ({
  processSessionAudio: (...a: unknown[]) => processSessionAudio(...a),
  SummaryParseError: class SummaryParseError extends Error {},
}))
vi.mock('@/lib/recap/postDraft', () => ({ postRecapDraft: (...a: unknown[]) => postRecapDraft(...a) }))

import { runProcessingInBackground } from '@/lib/sessions/runProcessingInBackground'

function makeSupabase(opts: { failProcessingError?: boolean } = {}) {
  const updates: Record<string, unknown>[] = []
  const supabase = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        updates.push(patch)
        const isCause = Object.keys(patch).join() === 'processing_error'
        return {
          eq: () =>
            Promise.resolve({
              error: isCause && opts.failProcessingError ? { message: 'column processing_error does not exist' } : null,
            }),
        }
      },
    }),
  }
  return { supabase: supabase as never, updates }
}
const statusUpdates = (u: Record<string, unknown>[]) => u.filter((p) => 'processing_status' in p)
const causeUpdates = (u: Record<string, unknown>[]) => u.filter((p) => 'processing_error' in p)
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  processSessionAudio.mockReset()
  postRecapDraft.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runProcessingInBackground', () => {
  it('calls processSessionAudio once and posts the draft only when not lowQuality', async () => {
    const { supabase } = makeSupabase()
    processSessionAudio.mockResolvedValue({ lowQuality: false })
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(processSessionAudio).toHaveBeenCalledTimes(1)
    expect(postRecapDraft).toHaveBeenCalledTimes(1)

    postRecapDraft.mockReset()
    processSessionAudio.mockResolvedValue({ lowQuality: true })
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(postRecapDraft).not.toHaveBeenCalled()
  })

  it('does not set status=error when postRecapDraft rejects', async () => {
    const { supabase, updates } = makeSupabase()
    processSessionAudio.mockResolvedValue({ lowQuality: false })
    postRecapDraft.mockRejectedValue(new Error('slack down'))
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(statusUpdates(updates)).toEqual([])
  })

  it('sets status=error and skips the draft when processing rejects', async () => {
    const { supabase, updates } = makeSupabase()
    processSessionAudio.mockRejectedValue(new Error('stt failed'))
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(statusUpdates(updates)).toHaveLength(1)
    expect(statusUpdates(updates)[0]).toMatchObject({ processing_status: 'error' })
    expect(postRecapDraft).not.toHaveBeenCalled()
  })

  it('records the classified code in a separate update (payload is only processing_error)', async () => {
    const { supabase, updates } = makeSupabase()
    processSessionAudio.mockRejectedValue(new Error('429 You have no credits remaining. Add credits.'))
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(statusUpdates(updates)).toHaveLength(1)
    expect(causeUpdates(updates)).toEqual([{ processing_error: 'stt_quota' }])
    // status 업데이트가 먼저, 원인 기록이 그 다음
    expect(updates.indexOf(statusUpdates(updates)[0])).toBeLessThan(updates.indexOf(causeUpdates(updates)[0]))
  })

  it('records unknown for unclassifiable errors and never stores the raw message', async () => {
    const { supabase, updates } = makeSupabase()
    processSessionAudio.mockRejectedValue(new Error('secret sk-abc123 leaked'))
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(causeUpdates(updates)).toEqual([{ processing_error: 'unknown' }])
    expect(JSON.stringify(updates)).not.toContain('sk-abc123')
  })

  it('does not record a second code for SummaryParseError (processAudio already did) and writes no status', async () => {
    const { supabase, updates } = makeSupabase()
    const { SummaryParseError } = await import('@/lib/sessions/processAudio')
    processSessionAudio.mockRejectedValue(new (SummaryParseError as new (m: string, r: string) => Error)('bad', 'raw'))
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(updates).toEqual([])
  })

  it('a failing processing_error write does not change the status update and does not throw', async () => {
    const { supabase, updates } = makeSupabase({ failProcessingError: true })
    processSessionAudio.mockRejectedValue(new Error('429 You have no credits remaining'))
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(statusUpdates(updates)).toHaveLength(1)
    expect(statusUpdates(updates)[0]).toMatchObject({ processing_status: 'error' })
    expect(causeUpdates(updates)).toEqual([{ processing_error: 'stt_quota' }])
  })

  it.each([false, true])('clears processing_error on success (lowQuality=%s) via a separate update', async (lowQuality) => {
    const { supabase, updates } = makeSupabase()
    processSessionAudio.mockResolvedValue({ lowQuality })
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(updates).toEqual([{ processing_error: null }])
  })

  it('success-path clear failure is swallowed and does not trigger status=error', async () => {
    const { supabase, updates } = makeSupabase({ failProcessingError: true })
    processSessionAudio.mockResolvedValue({ lowQuality: false })
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(statusUpdates(updates)).toEqual([])
    expect(postRecapDraft).toHaveBeenCalledTimes(1)
  })
})
