import { describe, it, expect } from 'vitest'
import { nextWorkingDay, addWorkingDays, scheduleRelativeMilestones, draftToRelative } from '@/lib/milestone-schedule'

describe('milestone schedule', () => {
  it('nextWorkingDay rolls a Saturday to Monday', () => {
    expect(nextWorkingDay('2026-06-20')).toBe('2026-06-22') // Sat -> Mon
  })
  it('addWorkingDays(0) returns the first working day on/after', () => {
    expect(addWorkingDays('2026-06-16', 0)).toBe('2026-06-16') // Tue
  })
  it('addWorkingDays skips the weekend', () => {
    expect(addWorkingDays('2026-06-19', 1)).toBe('2026-06-22') // Fri +1 -> Mon
  })
  it('addWorkingDays skips a non-weekend holiday (어린이날 Tue 2026-05-05)', () => {
    expect(addWorkingDays('2026-05-04', 1)).toBe('2026-05-06') // Mon +1 skips Tue holiday -> Wed
  })
  it('schedules a top-level milestone: offset 0, duration 5 working days', () => {
    const out = scheduleRelativeMilestones('2026-06-16', [
      { title: 'A', offset_days: 0, duration_days: 5 },
    ])
    expect(out[0].start_date).toBe('2026-06-16')
    expect(out[0].due_date).toBe('2026-06-22') // 16,17,18,19,22
  })
  it('schedules children relative to project start and preserves order', () => {
    const out = scheduleRelativeMilestones('2026-06-16', [
      { title: 'P', offset_days: 0, duration_days: 3, children: [
        { title: 'C1', offset_days: 0, duration_days: 2 },
      ] },
    ])
    expect(out[0].children?.[0].start_date).toBe('2026-06-16')
    expect(out[0].children?.[0].due_date).toBe('2026-06-17')
  })
  it('draftToRelative is the inverse of scheduleRelativeMilestones (round-trip)', () => {
    const rel = [
      { title: 'A', offset_days: 0, duration_days: 5, children: [{ title: 'A1', offset_days: 0, duration_days: 2 }] },
      { title: 'B', offset_days: 5, duration_days: 3 },
    ]
    const scheduled = scheduleRelativeMilestones('2026-06-16', rel)
    const back = draftToRelative(scheduled, '2026-06-16')
    expect(back[0].offset_days).toBe(0)
    expect(back[0].duration_days).toBe(5)
    expect(back[0].children?.[0].offset_days).toBe(0)
    expect(back[0].children?.[0].duration_days).toBe(2)
    expect(back[1].offset_days).toBe(5)
    expect(back[1].duration_days).toBe(3)
  })
  it('draftToRelative handles null dates with safe defaults', () => {
    const back = draftToRelative([{ title: 'X', start_date: null, due_date: null }], '2026-06-16')
    expect(back[0].offset_days).toBe(0)
    expect(back[0].duration_days).toBe(1)
  })
})
