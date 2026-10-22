import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OneOnOneOverviewClient } from '@/app/admin/one-on-one/OneOnOneOverviewClient'
import type { OverviewRow, OverviewBooking } from '@/lib/one-on-one/overview'
import type { Season } from '@/lib/types'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const season: Season = {
  id: 's2', name: '2기', status: 'active', is_current: true,
  start_date: '2026-10-01', end_date: null, created_at: '2026-09-01T00:00:00Z',
}

function booking(over: Partial<OverviewBooking>): OverviewBooking {
  return {
    id: 'b1', champion_user_id: 'u1', slot_start: '2026-10-25T05:00:00Z', slot_end: '2026-10-25T05:30:00Z',
    status: 'confirmed', confirmed_by: 'admin1', created_at: '2026-10-20T01:00:00Z', updated_at: '2026-10-21T01:00:00Z',
    ...over,
  }
}

function row(over: Partial<OverviewRow>): OverviewRow {
  return {
    userId: 'u1', name: '김하나', department: '기획팀', sessionCount: 0, lastSession: null,
    nextBooking: null, pendingBooking: null, cancelledCount: 0, latestRequestAt: null,
    flags: { missingRecord: false, zeroMeetings: true }, timeline: [], ...over,
  }
}

const rows: OverviewRow[] = [
  row({
    userId: 'u1', name: '김하나',
    pendingBooking: booking({ id: 'p1', status: 'pending', confirmed_by: null, slot_start: '2026-10-26T06:00:00Z' }),
    latestRequestAt: '2026-10-20T01:00:00Z',
    timeline: [
      { kind: 'booking_requested', at: '2026-10-20T01:00:00Z', bookingId: 'p1', slotStart: '2026-10-25T05:00:00Z', status: 'pending' },
      { kind: 'booking_cancelled', at: '2026-10-21T01:00:00Z', bookingId: 'c1', slotStart: '2026-10-24T05:00:00Z' },
      {
        kind: 'session', at: '2026-10-22T05:00:00Z', sessionId: 'x', number: 1,
        sessionDate: '2026-10-22', sessionTime: '14:00:00', title: '첫 미팅',
      },
    ],
  }),
  row({
    userId: 'u2', name: '이둘', department: '디자인팀', sessionCount: 2,
    nextBooking: booking({ id: 'n1', champion_user_id: 'u2' }),
    flags: { missingRecord: false, zeroMeetings: false },
  }),
  row({ userId: 'u3', name: '박셋', sessionCount: 1, flags: { missingRecord: true, zeroMeetings: false } }),
]

function renderClient(over: Partial<React.ComponentProps<typeof OneOnOneOverviewClient>> = {}) {
  return render(
    <OneOnOneOverviewClient
      seasons={[season]} season={season} rows={rows} startDateMissing={false}
      adminNames={{ admin1: '관리자A' }} {...over}
    />,
  )
}

describe('OneOnOneOverviewClient', () => {
  it('shows chip counts and filters rows when a chip is clicked', () => {
    renderClient()
    expect(screen.getByRole('button', { name: '전체 3' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '대기 있음 1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '예정 있음 1' }))
    expect(screen.queryByText('김하나')).toBeNull()
    expect(screen.getByText('이둘')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '누락 의심 1' }))
    expect(screen.getByText('박셋')).toBeTruthy()
    expect(screen.queryByText('이둘')).toBeNull()
  })

  it('shows KST next meeting with confirming admin', () => {
    renderClient()
    expect(screen.getByText(/14:00/)).toBeTruthy()
    expect(screen.getByText(/관리자A/)).toBeTruthy()
  })

  it('expands a row to show the timeline and champion link', () => {
    renderClient()
    fireEvent.click(screen.getByRole('button', { name: /김하나 상세 펼치기/ }))
    expect(screen.getByText('1회차 세션')).toBeTruthy()
    expect(screen.getByText('신청')).toBeTruthy()
    expect(screen.getByText('취소')).toBeTruthy()
    const link = screen.getByRole('link', { name: /챔피언 상세/ })
    expect(link.getAttribute('href')).toBe('/admin/champions/u1')
  })

  it('shows an empty state when there are no champions', () => {
    renderClient({ rows: [] })
    expect(screen.getByText('이 시즌에 등록된 챔피언이 없어요.')).toBeTruthy()
  })

  it('shows an empty state when the chip matches nothing', () => {
    renderClient({ rows: [rows[1]] })
    fireEvent.click(screen.getByRole('button', { name: '0회 0' }))
    expect(screen.getByText('조건에 맞는 챔피언이 없어요.')).toBeTruthy()
  })

  it('shows a no-season state', () => {
    renderClient({ season: null, rows: [], seasons: [] })
    expect(screen.getByText('표시할 시즌이 없어요.')).toBeTruthy()
  })

  it('shows the banner only when start_date is missing', () => {
    const { unmount } = renderClient({ startDateMissing: true })
    expect(screen.getByRole('status').textContent).toMatch(/시작일/)
    unmount()
    renderClient()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('navigates when a season is selected', () => {
    renderClient()
    fireEvent.change(screen.getByLabelText('시즌'), { target: { value: 's2' } })
    expect(push).toHaveBeenCalledWith('/admin/one-on-one?season=s2')
  })
})
