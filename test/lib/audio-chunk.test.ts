// test/lib/audio-chunk.test.ts
import { describe, it, expect } from 'vitest'
import { planChunks, encodeWav } from '@/lib/audio/chunk'

describe('planChunks', () => {
  it('splits by maxSec when that is the tighter bound', () => {
    const sr = 16000
    const total = sr * 1500 // 25 min
    const chunks = planChunks(total, sr, { maxSec: 720, maxBytes: 1e12 })
    expect(chunks.length).toBe(3) // 720,720,60
    expect(chunks[0]).toEqual({ start: 0, end: 720 * sr })
    expect(chunks[chunks.length - 1].end).toBe(total)
    for (const c of chunks) expect(c.end - c.start).toBeLessThanOrEqual(720 * sr)
  })

  it('splits by maxBytes when that is tighter', () => {
    const sr = 16000
    const total = sr * 1500
    // 24MB / 2 bytes ≈ 12.58M samples ≈ 786s → tighter than 1400s but looser than 720s
    const chunks = planChunks(total, sr, { maxSec: 1400, maxBytes: 24 * 1024 * 1024 })
    const maxSamples = Math.floor((24 * 1024 * 1024 - 44) / 2)
    for (const c of chunks) expect(c.end - c.start).toBeLessThanOrEqual(maxSamples)
  })

  it('returns one chunk for short audio', () => {
    const sr = 16000
    expect(planChunks(sr * 60, sr)).toEqual([{ start: 0, end: sr * 60 }])
  })

  it('clamps to hard limits when caller passes larger maxSec/maxBytes', () => {
    const sr = 16000
    const chunks = planChunks(sr * 5000, sr, { maxSec: 2000, maxBytes: 30 * 1024 * 1024 })
    const hardBySec = 1400 * sr
    const hardByBytes = Math.floor((25 * 1024 * 1024 - 44) / 2)
    for (const c of chunks) {
      expect(c.end - c.start).toBeLessThanOrEqual(hardBySec)
      expect(c.end - c.start).toBeLessThanOrEqual(hardByBytes)
    }
  })
})

describe('encodeWav', () => {
  it('writes a valid 16kHz mono 16-bit WAV header', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 16000)
    const dv = new DataView(wav.buffer)
    expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe('RIFF')
    expect(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])).toBe('WAVE')
    expect(dv.getUint16(22, true)).toBe(1)       // mono
    expect(dv.getUint32(24, true)).toBe(16000)   // sample rate
    expect(dv.getUint16(34, true)).toBe(16)      // bits
    expect(dv.getUint32(40, true)).toBe(5 * 2)   // data bytes
    expect(wav.length).toBe(44 + 5 * 2)
  })
})
