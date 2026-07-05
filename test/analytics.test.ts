import { describe, it, expect } from 'vitest'
import { normalizeRoute } from '@/lib/analytics/route'
import { AnalyticsEvent, DUAL_WRITE_EVENTS } from '@/lib/analytics/events'

describe('normalizeRoute', () => {
  it('replaces champion userId segment', () => {
    expect(normalizeRoute('/champions/abc-123')).toBe('/champions/[userId]')
  })

  it('replaces charter id segment', () => {
    expect(normalizeRoute('/my-project/charter/xyz789')).toBe(
      '/my-project/charter/[id]',
    )
  })

  it('replaces session id segment', () => {
    expect(normalizeRoute('/my-project/sessions/sess_42')).toBe(
      '/my-project/sessions/[sessionId]',
    )
  })

  it('leaves static routes untouched', () => {
    expect(normalizeRoute('/my-project/milestones')).toBe(
      '/my-project/milestones',
    )
    expect(normalizeRoute('/')).toBe('/')
    expect(normalizeRoute('/my-project/charter')).toBe('/my-project/charter')
  })
})

describe('DUAL_WRITE_EVENTS', () => {
  it('includes all P0 funnel events + milestone_issue_reported', () => {
    const expected = [
      AnalyticsEvent.CHAMPION_LOGIN_COMPLETED,
      AnalyticsEvent.CHARTER_CREATION_STARTED,
      AnalyticsEvent.CHARTER_PUBLISHED,
      AnalyticsEvent.MILESTONE_ADDED,
      AnalyticsEvent.MILESTONE_MARKED_COMPLETE,
      AnalyticsEvent.SUBMISSION_COMPLETED,
      AnalyticsEvent.MILESTONE_ISSUE_REPORTED,
    ]
    for (const e of expected) expect(DUAL_WRITE_EVENTS.has(e)).toBe(true)
    expect(DUAL_WRITE_EVENTS.size).toBe(expected.length)
  })

  it('excludes non-owned events (page + P1/P2 friction)', () => {
    expect(DUAL_WRITE_EVENTS.has(AnalyticsEvent.PAGE_VIEWED)).toBe(false)
    expect(DUAL_WRITE_EVENTS.has(AnalyticsEvent.ONE_ON_ONE_BOOKED)).toBe(false)
    expect(DUAL_WRITE_EVENTS.has(AnalyticsEvent.HOTLINE_MESSAGE_SENT)).toBe(false)
  })
})
