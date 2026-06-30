// lib/audio/normalize.ts
export interface NormalizeOpts {
  targetRmsDb?: number
  maxGainDb?: number
  limitDb?: number
}

/**
 * RMS 기반 게인 정규화 + 하드 리미터. 저음량 음성을 일정 레벨로 끌어올리되,
 * maxGainDb로 노이즈 과증폭을 막고 limitDb로 클리핑한다. 무음은 그대로 통과.
 */
export function normalizePcm(samples: Float32Array, opts: NormalizeOpts = {}): Float32Array {
  const targetRmsDb = opts.targetRmsDb ?? -20
  const maxGainDb = opts.maxGainDb ?? 30
  const limitDb = opts.limitDb ?? -1

  let sumSq = 0
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i]
  const rms = Math.sqrt(sumSq / Math.max(1, samples.length))
  if (rms < 1e-6) return samples.slice()

  const targetRms = Math.pow(10, targetRmsDb / 20)
  const maxGain = Math.pow(10, maxGainDb / 20)
  const gain = Math.min(targetRms / rms, maxGain)
  const limit = Math.pow(10, limitDb / 20)

  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    let v = samples[i] * gain
    if (v > limit) v = limit
    else if (v < -limit) v = -limit
    out[i] = v
  }
  return out
}
