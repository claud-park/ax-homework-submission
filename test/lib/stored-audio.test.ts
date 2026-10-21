import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listStoredChunkPaths } from '@/lib/sessions/storedAudio'

function stubClient(result: { data: { name: string }[] | null; error: unknown }) {
  const calls: { bucket: string; dir: string }[] = []
  const client = {
    storage: {
      from: (bucket: string) => ({
        list: async (dir: string) => {
          calls.push({ bucket, dir })
          return result
        },
      }),
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('listStoredChunkPaths', () => {
  it('returns only chunk wav files, sorted', async () => {
    const { client, calls } = stubClient({
      data: [{ name: 'chunk_001.wav' }, { name: 'notes.txt' }, { name: 'chunk_000.wav' }],
      error: null,
    })
    const paths = await listStoredChunkPaths(client, 's1')
    expect(paths).toEqual(['sessions/s1/chunk_000.wav', 'sessions/s1/chunk_001.wav'])
    expect(calls[0]).toEqual({ bucket: 'check-up-sessions', dir: 'sessions/s1' })
  })

  it('returns [] when listing errors or is empty', async () => {
    expect(await listStoredChunkPaths(stubClient({ data: null, error: { message: 'boom' } }).client, 's1')).toEqual([])
    expect(await listStoredChunkPaths(stubClient({ data: [], error: null }).client, 's1')).toEqual([])
  })
})
