// test/lib/audio-normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizePcm } from '@/lib/audio/normalize'

function rmsDb(s: Float32Array) {
  let sum = 0
  for (const v of s) sum += v * v
  return 20 * Math.log10(Math.sqrt(sum / s.length))
}

describe('normalizePcm', () => {
  it('boosts quiet audio toward target RMS', () => {
    const quiet = new Float32Array(16000).map((_, i) => 0.01 * Math.sin(i / 4)) // ~-43dB
    const out = normalizePcm(quiet, { targetRmsDb: -20, maxGainDb: 30 })
    expect(rmsDb(out)).toBeGreaterThan(-24)
    expect(rmsDb(out)).toBeLessThan(-16)
  })

  it('passes silence through unchanged (no noise blow-up)', () => {
    const silence = new Float32Array(1000)
    const out = normalizePcm(silence)
    expect(Array.from(out).every(v => v === 0)).toBe(true)
  })

  it('limits peaks to limitDb', () => {
    const loud = new Float32Array(1000).map(() => 0.9)
    const out = normalizePcm(loud, { targetRmsDb: 0, maxGainDb: 30, limitDb: -1 })
    const limit = Math.pow(10, -1 / 20)
    expect(Math.max(...out)).toBeLessThanOrEqual(limit + 1e-6)
  })

  it('respects maxGainDb cap', () => {
    const veryQuiet = new Float32Array(1000).map(() => 0.001) // ~-60dB
    const out = normalizePcm(veryQuiet, { targetRmsDb: -20, maxGainDb: 10 })
    expect(rmsDb(out)).toBeLessThan(-45) // -60 + 10 ≈ -50, far below -20
  })
})
