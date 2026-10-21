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

function makeSupabase() {
  const updates: Record<string, unknown>[] = []
  const supabase = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        updates.push(patch)
        return { eq: () => Promise.resolve({ error: null }) }
      },
    }),
  }
  return { supabase: supabase as never, updates }
}
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
    expect(updates).toEqual([])
  })

  it('sets status=error and skips the draft when processing rejects', async () => {
    const { supabase, updates } = makeSupabase()
    processSessionAudio.mockRejectedValue(new Error('stt failed'))
    runProcessingInBackground(supabase, 's1', ['a'], 10)
    await flush()
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ processing_status: 'error' })
    expect(postRecapDraft).not.toHaveBeenCalled()
  })
})
