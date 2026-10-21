import { describe, it, expect, vi, afterEach } from 'vitest'
import { withRetry, HttpError, isTransientError } from '@/lib/sessions/retry'

const noSleep = async () => {}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('withRetry', () => {
  it('retries a transient error then succeeds', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce('ok')
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws immediately on a non-transient error', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new HttpError(400, 'bad'))
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toThrow('bad')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after attempts and rethrows the last error', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new HttpError(503, 'down'))
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow('down')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('backs off exponentially', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new HttpError(503, 'a'))
      .mockRejectedValueOnce(new HttpError(503, 'b'))
      .mockResolvedValueOnce('ok')
    await withRetry(fn, { baseMs: 1000, sleep })
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000])
  })

  it('offline failures do not consume an attempt', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls === 1) throw new TypeError('Failed to fetch')
      return 'ok'
    })
    const p = withRetry(fn, { attempts: 1, sleep: noSleep })
    await new Promise((r) => setTimeout(r, 0))
    expect(fn).toHaveBeenCalledTimes(1)
    vi.stubGlobal('navigator', { onLine: true })
    window.dispatchEvent(new Event('online'))
    await expect(p).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('isTransientError', () => {
  it.each([
    [new TypeError('Failed to fetch'), true],
    [new HttpError(503, 'x'), true],
    [new HttpError(429, 'x'), true],
    [new HttpError(408, 'x'), true],
    [new Error('Load failed'), true],
    [new HttpError(401, 'x'), false],
    [new HttpError(400, 'x'), false],
    [new Error('x'), false],
  ])('%s -> %s', (err, expected) => {
    expect(isTransientError(err)).toBe(expected)
  })
})
