import { describe, it, expect } from 'vitest'
import { GenerationOutputSchema, buildGenerationPrompt, buildRefinePrompt } from '@/lib/milestone-ai'

describe('milestone-ai', () => {
  it('schema accepts valid AI output', () => {
    const parsed = GenerationOutputSchema.safeParse({
      milestones: [
        { title: 'A', offset_days: 0, duration_days: 5,
          children: [{ title: 'A1', offset_days: 0, duration_days: 2 }] },
      ],
    })
    expect(parsed.success).toBe(true)
  })
  it('schema rejects negative duration', () => {
    const parsed = GenerationOutputSchema.safeParse({
      milestones: [{ title: 'A', offset_days: 0, duration_days: 0 }],
    })
    expect(parsed.success).toBe(false)
  })
  it('prompt includes charter content when provided', () => {
    const p = buildGenerationPrompt(
      { problem: '느린 결제', goal: '결제 3초 이내' },
      '8주 일정으로',
    )
    expect(p).toContain('느린 결제')
    expect(p).toContain('결제 3초 이내')
    expect(p).toContain('8주 일정으로')
  })
  it('prompt is robust when charter is empty', () => {
    const p = buildGenerationPrompt({}, undefined)
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
  })
  it('buildRefinePrompt includes the instruction and current milestone titles', () => {
    const p = buildRefinePrompt(
      [{ title: '베타 테스트', offset_days: 5, duration_days: 5 }],
      '베타를 2주로 늘려줘',
    )
    expect(p).toContain('베타 테스트')
    expect(p).toContain('베타를 2주로 늘려줘')
    expect(p).toContain('offset_days')
  })
})
