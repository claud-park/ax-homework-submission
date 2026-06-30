import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/audio-pipeline/transcribe', () => ({
  transcribeAudio: vi.fn(),
}))
vi.mock('@/lib/audio-pipeline/summarize', () => ({
  summarizeTranscript: vi.fn(async () => ({ notes: '요약', actionItems: [], inputTokens: 1, outputTokens: 1 })),
}))

import { transcribeAudio } from '@/lib/audio-pipeline/transcribe'
import { processSessionAudio } from '@/lib/sessions/processAudio'

function fakeSupabase() {
  const updates: any[] = []
  const storage = {
    from: () => ({ download: vi.fn(async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null })) }),
  }
  const from = (table: string) => ({
    update: (vals: any) => { updates.push({ table, vals }); return { eq: () => ({ select: async () => ({ data: [{ id: 'x' }] }) }) } },
    delete: () => ({ eq: async () => ({}) }),
    insert: () => ({ select: async () => ({ data: [] }) }),
    select: () => ({ eq: () => ({ single: async () => ({ data: { notes: '' } }) }) }),
  })
  return { client: { from, storage } as any, updates }
}

describe('processSessionAudio (chunked)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('transcribes each chunk in order and joins', async () => {
    ;(transcribeAudio as any).mockResolvedValueOnce('첫번째 청크 내용 다양함 한국어 문장 여러개')
      .mockResolvedValueOnce('두번째 청크 또다른 내용 정상적인 대화')
    const { client } = fakeSupabase()
    const res = await processSessionAudio(client, 's1', ['sessions/s1/chunk_000.wav', 'sessions/s1/chunk_001.wav'], 10)
    expect((transcribeAudio as any).mock.calls.length).toBe(2)
    expect(res.notes).toContain('요약')
    expect(res.lowQuality).toBeFalsy()
  })

  it('marks lowQuality on repetitive transcript', async () => {
    ;(transcribeAudio as any).mockResolvedValue(Array(50).fill('같은말 반복').join(' '))
    const { client, updates } = fakeSupabase()
    const res = await processSessionAudio(client, 's1', ['sessions/s1/chunk_000.wav'], 1500)
    expect(res.lowQuality).toBe(true)
    expect(updates.some(u => u.vals.processing_status === 'low_quality')).toBe(true)
  })
})
