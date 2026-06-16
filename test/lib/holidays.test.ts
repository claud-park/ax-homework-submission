import { describe, it, expect } from 'vitest'
import { toKey, parseKey, isWorkingDay, countWorkingDays } from '@/lib/holidays'

describe('holidays primitives', () => {
  it('toKey/parseKey round-trip', () => {
    expect(toKey(parseKey('2026-06-16'))).toBe('2026-06-16')
  })
  it('weekends are not working days', () => {
    expect(isWorkingDay(parseKey('2026-06-20'))).toBe(false) // Saturday
    expect(isWorkingDay(parseKey('2026-06-21'))).toBe(false) // Sunday
  })
  it('Korean holiday is not a working day (어린이날 2026-05-05)', () => {
    expect(isWorkingDay(parseKey('2026-05-05'))).toBe(false)
  })
  it('a normal weekday is a working day', () => {
    expect(isWorkingDay(parseKey('2026-06-16'))).toBe(true) // Tuesday
  })
  it('countWorkingDays excludes weekend (Mon–Fri = 5)', () => {
    expect(countWorkingDays('2026-06-15', '2026-06-19')).toBe(5)
  })
})
