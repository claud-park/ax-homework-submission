import { describe, it, expect } from 'vitest'
import { isOverdueMilestone, hasOverdueMilestone } from '@/lib/nudge/overdue'

const TODAY = '2026-07-06'

describe('isOverdueMilestone (gantt 빨간 박스 기준)', () => {
  it('completed 는 마감이 지났어도 지연 아님', () => {
    expect(isOverdueMilestone({ status: 'completed', start_date: '2026-06-01', due_date: '2026-06-30' }, TODAY)).toBe(false)
  })

  it('명시적 delayed 는 지연', () => {
    expect(isOverdueMilestone({ status: 'delayed', start_date: '2026-06-01', due_date: '2026-07-30' }, TODAY)).toBe(true)
  })

  it('not_started + 마감 경과 → 지연', () => {
    expect(isOverdueMilestone({ status: 'not_started', start_date: '2026-06-01', due_date: '2026-07-05' }, TODAY)).toBe(true)
  })

  it('in_progress + 마감 경과 → 지연', () => {
    expect(isOverdueMilestone({ status: 'in_progress', start_date: '2026-06-01', due_date: '2026-07-05' }, TODAY)).toBe(true)
  })

  it('마감이 오늘이면(아직 안 지남) 지연 아님', () => {
    expect(isOverdueMilestone({ status: 'in_progress', start_date: '2026-06-01', due_date: TODAY }, TODAY)).toBe(false)
  })

  it('마감이 미래면 지연 아님', () => {
    expect(isOverdueMilestone({ status: 'not_started', start_date: '2026-06-01', due_date: '2026-07-30' }, TODAY)).toBe(false)
  })

  it('시작이 미래인 마일스톤은(회색) 지연 아님', () => {
    expect(isOverdueMilestone({ status: 'delayed', start_date: '2026-08-01', due_date: '2026-08-30' }, TODAY)).toBe(false)
  })

  it('due_date 없는 not_started 는 지연 아님', () => {
    expect(isOverdueMilestone({ status: 'not_started', start_date: null, due_date: null }, TODAY)).toBe(false)
  })
})

describe('hasOverdueMilestone', () => {
  it('하나라도 지연이면 true', () => {
    const ms = [
      { status: 'completed' as const, start_date: '2026-06-01', due_date: '2026-06-10' },
      { status: 'in_progress' as const, start_date: '2026-06-01', due_date: '2026-07-05' },
    ]
    expect(hasOverdueMilestone(ms, TODAY)).toBe(true)
  })

  it('모두 정상이면 false', () => {
    const ms = [
      { status: 'completed' as const, start_date: '2026-06-01', due_date: '2026-06-10' },
      { status: 'in_progress' as const, start_date: '2026-06-01', due_date: '2026-07-30' },
    ]
    expect(hasOverdueMilestone(ms, TODAY)).toBe(false)
  })

  it('빈 목록이면 false', () => {
    expect(hasOverdueMilestone([], TODAY)).toBe(false)
  })
})
