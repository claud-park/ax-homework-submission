// lib/audio/chunk.ts
const WAV_HEADER_BYTES = 44
const HARD_MAX_SEC = 1400
const HARD_MAX_BYTES = 25 * 1024 * 1024

export interface ChunkOpts {
  maxSec?: number
  maxBytes?: number
  bytesPerSample?: number
}

/** 청크 경계(샘플 인덱스) 계산: maxSec와 maxBytes 중 더 작은 상한으로 균등 분할. */
export function planChunks(
  totalSamples: number,
  sampleRate: number,
  opts: ChunkOpts = {}
): { start: number; end: number }[] {
  const maxSec = opts.maxSec ?? 720
  const maxBytes = opts.maxBytes ?? 24 * 1024 * 1024
  const bytesPerSample = opts.bytesPerSample ?? 2

  const effMaxSec = Math.min(maxSec, HARD_MAX_SEC)
  const effMaxBytes = Math.min(maxBytes, HARD_MAX_BYTES)
  const byBytes = Math.floor((effMaxBytes - WAV_HEADER_BYTES) / bytesPerSample)
  const bySec = Math.floor(effMaxSec * sampleRate)
  const maxSamples = Math.max(1, Math.min(byBytes, bySec))

  const chunks: { start: number; end: number }[] = []
  for (let start = 0; start < totalSamples; start += maxSamples) {
    chunks.push({ start, end: Math.min(start + maxSamples, totalSamples) })
  }
  if (chunks.length === 0) chunks.push({ start: 0, end: 0 })
  return chunks
}

/** Float32 PCM → 16kHz mono 16-bit PCM WAV 바이트. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const n = samples.length
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + n * 2)
  const view = new DataView(buffer)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + n * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)            // PCM
  view.setUint16(22, 1, true)            // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)            // block align
  view.setUint16(34, 16, true)           // bits
  writeStr(36, 'data')
  view.setUint32(40, n * 2, true)
  let off = WAV_HEADER_BYTES
  for (let i = 0; i < n; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]))
    s = s < 0 ? s * 0x8000 : s * 0x7fff
    view.setInt16(off, s, true)
    off += 2
  }
  return new Uint8Array(buffer)
}
