import { describe, it, expect } from 'vitest'
import { hoursUntilNextNudge, NUDGE_COOLDOWN_HOURS } from '@/lib/nudge/cooldown'

describe('hoursUntilNextNudge', () => {
  const now = new Date('2026-07-03T12:00:00Z')

  it('returns 0 when there is no prior nudge (allowed)', () => {
    expect(hoursUntilNextNudge(null, now)).toBe(0)
  })

  it('returns 0 when the cooldown has fully elapsed', () => {
    const last = new Date(now.getTime() - (NUDGE_COOLDOWN_HOURS + 1) * 3_600_000)
    expect(hoursUntilNextNudge(last, now)).toBe(0)
  })

  it('returns remaining hours (ceil) when within cooldown', () => {
    const last = new Date(now.getTime() - 5 * 3_600_000) // 5h ago
    expect(hoursUntilNextNudge(last, now, 20)).toBe(15)
  })

  it('rounds partial remaining hours up', () => {
    const last = new Date(now.getTime() - 18.2 * 3_600_000) // 18.2h ago, 20h cooldown → 1.8h left
    expect(hoursUntilNextNudge(last, now, 20)).toBe(2)
  })

  it('a nudge exactly at the cooldown boundary is allowed', () => {
    const last = new Date(now.getTime() - 20 * 3_600_000)
    expect(hoursUntilNextNudge(last, now, 20)).toBe(0)
  })
})
