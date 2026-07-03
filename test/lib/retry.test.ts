import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '@/lib/retry'

describe('withRetry', () => {
  it('returns immediately on first success (no retries)', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { baseDelayMs: 0 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures and succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('blip 1'))
      .mockRejectedValueOnce(new Error('blip 2'))
      .mockResolvedValue('ok')
    const onRetry = vi.fn()
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 0, onRetry })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('throws the last error after exhausting attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'))
    await expect(withRetry(fn, { attempts: 2, baseDelayMs: 0 })).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
