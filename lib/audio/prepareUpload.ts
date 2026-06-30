// lib/audio/prepareUpload.ts
import { normalizePcm } from '@/lib/audio/normalize'
import { planChunks, encodeWav } from '@/lib/audio/chunk'

const TARGET_SR = 16000

/**
 * 녹음/업로드 blob을 16kHz mono로 디코드 → RMS 정규화 → ≤720s WAV 청크 배열로 변환.
 * 브라우저 전용(OfflineAudioContext). 디코드 실패 시 throw.
 */
export async function prepareAudioForUpload(
  blob: Blob,
  opts: { sampleRate?: number } = {}
): Promise<{ index: number; wav: Uint8Array }[]> {
  const sampleRate = opts.sampleRate ?? TARGET_SR
  const arrayBuf = await blob.arrayBuffer()

  // 임시 컨텍스트로 디코드 (브라우저가 원본 SR로 디코드)
  const AC: typeof AudioContext =
    (window as any).AudioContext ?? (window as any).webkitAudioContext
  const tmp = new AC()
  const decoded = await tmp.decodeAudioData(arrayBuf.slice(0))
  await tmp.close()

  // 16kHz mono로 리샘플/다운믹스
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * sampleRate), sampleRate)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  const mono = rendered.getChannelData(0)            // Float32Array @ sampleRate

  const normalized = normalizePcm(mono)
  const chunks = planChunks(normalized.length, sampleRate)
  return chunks.map((c, index) => ({
    index,
    wav: encodeWav(normalized.subarray(c.start, c.end), sampleRate),
  }))
}
