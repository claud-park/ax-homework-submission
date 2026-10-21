import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deleteRecording,
  loadRecording,
  saveRecording,
  type StoredRecording,
} from '@/lib/audio/localRecordingStore'

// jsdom's Blob is not structured-cloneable by fake-indexeddb (it round-trips as `{}`),
// so use Node's native Blob here. Real browsers clone Blobs natively.
function make(sessionId: string, size = 10, durationSec = 5, filename = 'a.webm'): StoredRecording {
  return {
    sessionId,
    blob: new NodeBlob([new Uint8Array(size)], { type: 'audio/webm' }) as unknown as Blob,
    durationSec,
    filename,
    savedAt: 123,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('localRecordingStore', () => {
  it('round-trips a recording', async () => {
    expect(await saveRecording(make('s1', 10, 42, 'x.webm'))).toBe(true)
    const got = await loadRecording('s1')
    expect(got).not.toBeNull()
    expect(got!.durationSec).toBe(42)
    expect(got!.filename).toBe('x.webm')
    expect(got!.blob.size).toBe(10)
  })

  it('load returns null for unknown session', async () => {
    expect(await loadRecording('nope')).toBeNull()
  })

  it('delete removes the recording', async () => {
    await saveRecording(make('s2'))
    await deleteRecording('s2')
    expect(await loadRecording('s2')).toBeNull()
  })

  it('saving twice for the same session overwrites', async () => {
    await saveRecording(make('s3', 10, 1, 'old.webm'))
    await saveRecording(make('s3', 20, 2, 'new.webm'))
    const got = await loadRecording('s3')
    expect(got!.filename).toBe('new.webm')
    expect(got!.blob.size).toBe(20)
  })

  it('returns false / null without throwing when indexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(await saveRecording(make('s4'))).toBe(false)
    expect(await loadRecording('s4')).toBeNull()
    await expect(deleteRecording('s4')).resolves.toBeUndefined()
  })
})
