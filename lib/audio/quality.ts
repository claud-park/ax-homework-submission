// lib/audio/quality.ts
export interface TranscriptQuality {
  ok: boolean
  charsPerSec: number
  repetitionRatio: number
  reason?: 'empty' | 'repetitive' | 'low-yield'
}

/**
 * 전사 품질 휴리스틱. 저음량 환각은 (1) 같은 세그먼트 반복(낮은 고유비율),
 * (2) 길이 대비 매우 적은 글자수(낮은 chars/sec)로 드러난다.
 */
export function assessTranscript(
  text: string,
  durationSec: number,
  opts: { minCharsPerSec?: number; minRepetitionRatio?: number } = {}
): TranscriptQuality {
  const minCharsPerSec = opts.minCharsPerSec ?? 1.2
  const minRepetitionRatio = opts.minRepetitionRatio ?? 0.4

  const t = text.trim()
  const segs = t.split(/[\s.?!\n,]+/).map(s => s.trim()).filter(s => s.length >= 1)
  const repetitionRatio = segs.length ? new Set(segs).size / segs.length : 0
  const charsPerSec = durationSec > 0 ? t.length / durationSec : 0

  let reason: TranscriptQuality['reason']
  if (segs.length === 0) reason = 'empty'
  else if (repetitionRatio < minRepetitionRatio) reason = 'repetitive'
  else if (charsPerSec < minCharsPerSec) reason = 'low-yield'

  return { ok: !reason, charsPerSec, repetitionRatio, reason }
}
