import { describe, it, expect } from 'vitest'
import { normalizeBatch, type BatchInput } from '@/lib/milestone-batch'

const valid: BatchInput[] = [
  { title: 'Parent', start_date: '2026-06-16', due_date: '2026-06-20', source: 'ai',
    children: [{ title: 'Child', start_date: '2026-06-16', due_date: '2026-06-17', source: 'ai' }] },
]

describe('normalizeBatch', () => {
  it('accepts valid rows and counts total', () => {
    const r = normalizeBatch(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.parents[0].children.length).toBe(1)
  })
  it('rejects empty input', () => {
    expect(normalizeBatch([]).ok).toBe(false)
  })
  it('rejects a row without a title', () => {
    const r = normalizeBatch([{ title: '  ', start_date: null, due_date: null, source: 'manual' }])
    expect(r.ok).toBe(false)
  })
  it('rejects start_date after due_date', () => {
    const r = normalizeBatch([{ title: 'X', start_date: '2026-06-20', due_date: '2026-06-16', source: 'manual' }])
    expect(r.ok).toBe(false)
  })
})
