import { describe, it, expect } from 'vitest'
import { computeUsage } from '@/lib/audio-pipeline/costs'
import { parseSummaryResponse } from '@/lib/audio-pipeline/summarize'

describe('parseSummaryResponse', () => {
  it('parses plain JSON', () => {
    const result = parseSummaryResponse(
      JSON.stringify({ notes: '요약', actionItems: [{ body: '할 일' }] })
    )
    expect(result.notes).toBe('요약')
    expect(result.actionItems).toEqual([{ body: '할 일' }])
  })

  it('strips markdown code fences', () => {
    const result = parseSummaryResponse(
      '```json\n{"notes":"요약","actionItems":[{"body":"할 일"}]}\n```'
    )
    expect(result.notes).toBe('요약')
    expect(result.actionItems).toEqual([{ body: '할 일' }])
  })

  it('defaults missing fields', () => {
    const result = parseSummaryResponse('{}')
    expect(result.notes).toBe('')
    expect(result.actionItems).toEqual([])
  })

  it('throws on invalid JSON', () => {
    expect(() => parseSummaryResponse('not json')).toThrow()
  })
})

describe('computeUsage', () => {
  it('estimates Whisper and Claude costs', () => {
    const usage = computeUsage(120, 1000, 500)
    expect(usage.stt.durationSec).toBe(120)
    expect(usage.stt.cost).toBeCloseTo(0.012)
    expect(usage.claude.inputTokens).toBe(1000)
    expect(usage.claude.outputTokens).toBe(500)
    expect(usage.totalCost).toBeCloseTo(usage.stt.cost + usage.claude.cost)
  })
})
