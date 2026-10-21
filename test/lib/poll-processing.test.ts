import { describe, it, expect, vi, afterEach } from 'vitest'
import { pollProcessing, isTerminalStatus } from '@/lib/sessions/pollProcessing'

function mockFetchSequence(statuses: string[]) {
  let i = 0
  return vi.fn(async () => {
    const status = statuses[Math.min(i, statuses.length - 1)]
    i++
    return {
      ok: true,
      json: async () => ({ processing_status: status, notes: 'n', action_items: [], processing_usage: null }),
    } as Response
  })
}

afterEach(() => { vi.restoreAllMocks() })

describe('isTerminalStatus', () => {
  it('done/low_quality/error are terminal; in-flight are not', () => {
    expect(isTerminalStatus('done')).toBe(true)
    expect(isTerminalStatus('low_quality')).toBe(true)
    expect(isTerminalStatus('error')).toBe(true)
    expect(isTerminalStatus('transcribing')).toBe(false)
    expect(isTerminalStatus('summarizing')).toBe(false)
    expect(isTerminalStatus('idle')).toBe(false)
  })
})

describe('pollProcessing', () => {
  it('polls until a terminal status and returns that session', async () => {
    vi.stubGlobal('fetch', mockFetchSequence(['transcribing', 'summarizing', 'done']))
    const seen: string[] = []
    const result = await pollProcessing('s1', async () => 'tok', s => seen.push(s), { intervalMs: 1, timeoutMs: 5000 })
    expect(result.processing_status).toBe('done')
    expect(seen).toEqual(['transcribing', 'summarizing', 'done'])
  })

  it('resolves immediately-terminal error status', async () => {
    vi.stubGlobal('fetch', mockFetchSequence(['error']))
    const result = await pollProcessing('s1', async () => 'tok', () => {}, { intervalMs: 1, timeoutMs: 5000 })
    expect(result.processing_status).toBe('error')
  })

  it('throws on timeout if status never reaches terminal', async () => {
    vi.stubGlobal('fetch', mockFetchSequence(['transcribing']))
    await expect(
      pollProcessing('s1', async () => 'tok', () => {}, { intervalMs: 5, timeoutMs: 12 }),
    ).rejects.toThrow(/초과/)
  })

  it('survives fetch throwing and resumes', async () => {
    const ok = mockFetchSequence(['done'])
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (...args: unknown[]) => {
      calls++
      if (calls <= 2) throw new TypeError('Failed to fetch')
      return (ok as unknown as (...a: unknown[]) => Promise<Response>)(...args)
    }))
    const conn: boolean[] = []
    const result = await pollProcessing('s1', async () => 'tok', () => {}, {
      intervalMs: 1,
      timeoutMs: 5000,
      onConnection: c => conn.push(c),
    })
    expect(result.processing_status).toBe('done')
    expect(conn).toEqual([false, true])
  })

  it('does not time out while disconnected', async () => {
    const ok = mockFetchSequence(['done'])
    const t0 = Date.now()
    vi.stubGlobal('fetch', vi.fn(async (...args: unknown[]) => {
      if (Date.now() - t0 < 200) throw new TypeError('Failed to fetch')
      return (ok as unknown as (...a: unknown[]) => Promise<Response>)(...args)
    }))
    const result = await pollProcessing('s1', async () => 'tok', () => {}, { intervalMs: 1, timeoutMs: 50 })
    expect(result.processing_status).toBe('done')
  })

  it('still times out when connected but never terminal', async () => {
    vi.stubGlobal('fetch', mockFetchSequence(['summarizing']))
    await expect(
      pollProcessing('s1', async () => 'tok', () => {}, { intervalMs: 5, timeoutMs: 30, onConnection: () => {} }),
    ).rejects.toThrow(/초과/)
  })
})
