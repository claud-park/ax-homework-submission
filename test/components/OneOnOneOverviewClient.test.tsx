import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OneOnOneOverviewClient } from '@/app/admin/one-on-one/OneOnOneOverviewClient'
import type { OverviewRow, OverviewBooking } from '@/lib/one-on-one/overview'
import type { Season } from '@/lib/types'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const apiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const season: Season = {
  id: 's2', name: '2기', status: 'active', is_current: true,
  start_date: '2026-10-01', end_date: null, created_at: '2026-09-01T00:00:00Z',
}

function booking(over: Partial<OverviewBooking>): OverviewBooking {
  return {
    id: 'b1', champion_user_id: 'u1', slot_start: '2026-10-25T05:00:00Z', slot_end: '2026-10-25T05:30:00Z',
    status: 'confirmed', confirmed_by: 'claud', created_at: '2026-10-20T01:00:00Z', updated_at: '2026-10-21T01:00:00Z',
    ...over,
  }
}

function row(over: Partial<OverviewRow>): OverviewRow {
  return {
    userId: 'u1', name: '김하나', department: '기획팀', recapChannelId: null, sessionCount: 0, lastSession: null,
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
      { kind: 'booking_requested', at: '2026-10-20T01:00:00Z', bookingId: 'p1', slotStart: '2026-10-25T05:00:00Z', status: 'pending', source: 'web' },
      { kind: 'booking_cancelled', at: '2026-10-21T01:00:00Z', bookingId: 'c1', slotStart: '2026-10-24T05:00:00Z', source: 'web' },
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
  row({ userId: 'u3', name: '박셋', sessionCount: 1, recapChannelId: 'C0SAVED123', flags: { missingRecord: true, zeroMeetings: false } }),
]

function renderClient(over: Partial<React.ComponentProps<typeof OneOnOneOverviewClient>> = {}) {
  return render(
    <OneOnOneOverviewClient
      seasons={[season]} season={season} rows={rows} startDateMissing={false}
      {...over}
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
    expect(screen.getByText(/claud 확정/)).toBeTruthy()
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

  describe('recap 채널', () => {
    beforeEach(() => {
      apiFetch.mockReset()
      toast.success.mockReset()
      toast.error.mockReset()
    })

    it('shows the saved channel id or 미설정', () => {
      renderClient()
      expect(screen.getByText('recap 채널')).toBeTruthy()
      expect(screen.getByText('C0SAVED123')).toBeTruthy()
      expect(screen.getAllByText('미설정')).toHaveLength(2)
    })

    it('saves a trimmed channel id via the admin API and shows it', async () => {
      apiFetch.mockResolvedValue({ ok: true, channelId: 'C0NEW12345' })
      renderClient()
      fireEvent.click(screen.getByRole('button', { name: '김하나 recap 채널 수정' }))
      expect(screen.getByText(/채널 세부정보 맨 아래에서 복사/)).toBeTruthy()
      fireEvent.change(screen.getByLabelText('김하나 recap 채널 ID'), { target: { value: ' C0NEW12345 ' } })
      fireEvent.click(screen.getByRole('button', { name: '저장' }))
      await waitFor(() => expect(screen.getByText('C0NEW12345')).toBeTruthy())
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/users/u1/recap-channel', {
        method: 'PATCH',
        body: JSON.stringify({ channelId: 'C0NEW12345' }),
      })
      expect(toast.success).toHaveBeenCalled()
      // 필터 전환으로 다시 그려도 저장값이 유지된다
      fireEvent.click(screen.getByRole('button', { name: '대기 있음 1' }))
      expect(screen.getByText('C0NEW12345')).toBeTruthy()
    })

    it('clears a saved channel id', async () => {
      apiFetch.mockResolvedValue({ ok: true, channelId: null })
      renderClient()
      fireEvent.click(screen.getByRole('button', { name: '박셋 recap 채널 수정' }))
      fireEvent.click(screen.getByRole('button', { name: '지우기' }))
      await waitFor(() => expect(screen.queryByText('C0SAVED123')).toBeNull())
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/users/u3/recap-channel', {
        method: 'PATCH',
        body: JSON.stringify({ channelId: null }),
      })
      expect(screen.getAllByText('미설정')).toHaveLength(3)
      expect(toast.success).toHaveBeenCalled()
    })

    it('rejects an invalid id without calling the API', () => {
      renderClient()
      fireEvent.click(screen.getByRole('button', { name: '김하나 recap 채널 수정' }))
      fireEvent.change(screen.getByLabelText('김하나 recap 채널 ID'), { target: { value: '#general' } })
      fireEvent.click(screen.getByRole('button', { name: '저장' }))
      expect(apiFetch).not.toHaveBeenCalled()
      expect(screen.getByRole('alert').textContent).toMatch(/채널 ID 형식/)
      expect(toast.error).toHaveBeenCalled()
    })

    it('shows an error toast and stays in edit mode when the API fails', async () => {
      apiFetch.mockRejectedValue(new Error('마이그레이션 적용이 필요합니다'))
      renderClient()
      fireEvent.click(screen.getByRole('button', { name: '김하나 recap 채널 수정' }))
      fireEvent.change(screen.getByLabelText('김하나 recap 채널 ID'), { target: { value: 'C0NEW12345' } })
      fireEvent.click(screen.getByRole('button', { name: '저장' }))
      await waitFor(() => expect(toast.error).toHaveBeenCalled())
      expect(String(toast.error.mock.calls[0][0])).toContain('마이그레이션 적용이 필요합니다')
      expect(screen.getByLabelText('김하나 recap 채널 ID')).toBeTruthy()
    })
  })

  describe('Slack 봇 예약', () => {
    const slackRows: OverviewRow[] = [
      row({
        userId: 'u1', name: '김하나',
        pendingBooking: booking({ id: 'slack:p1', status: 'pending', confirmed_by: null, source: 'slack' }),
        timeline: [
          { kind: 'booking_requested', at: '2026-10-20T01:00:00Z', bookingId: 'slack:p1', slotStart: '2026-10-25T05:00:00Z', status: 'pending', source: 'slack' },
          { kind: 'booking_requested', at: '2026-10-19T01:00:00Z', bookingId: 'w1', slotStart: '2026-10-24T05:00:00Z', status: 'cancelled', source: 'web' },
        ],
      }),
      row({ userId: 'u2', name: '이둘', nextBooking: booking({ id: 'slack:n1', champion_user_id: 'u2', source: 'slack' }) }),
      row({ userId: 'u3', name: '박셋', nextBooking: booking({ id: 'n3', champion_user_id: 'u3' }) }),
    ]
    const unmapped = [
      { id: 'slack:o1', userName: '외부인', status: 'pending' as const, slotStart: '2026-10-28T05:00:00Z', createdAt: '2026-10-21T00:00:00Z' },
    ]

    it('Slack 예약에만 Slack 칩을 단다(다음 미팅·대기)', () => {
      renderClient({ rows: slackRows, slack: { enabled: true, error: false, unmapped: [] } })
      expect(screen.getAllByText('Slack')).toHaveLength(2)
    })

    it('타임라인의 Slack 항목에 (Slack) 표시', () => {
      renderClient({ rows: slackRows, slack: { enabled: true, error: false, unmapped: [] } })
      fireEvent.click(screen.getByRole('button', { name: /김하나 상세 펼치기/ }))
      expect(screen.getAllByText('(Slack)')).toHaveLength(1)
    })

    it('조회 실패 시 배너를 띄운다', () => {
      const { unmount } = renderClient({ slack: { enabled: true, error: true, unmapped: [] } })
      expect(screen.getByRole('status').textContent).toBe('Slack 예약 조회에 실패했어요. 웹 예약만 표시 중입니다.')
      unmount()
      renderClient({ slack: { enabled: true, error: false, unmapped: [] } })
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('미매핑 신청 섹션: 개수·이름·상태·안내를 보여준다', () => {
      renderClient({ slack: { enabled: true, error: false, unmapped } })
      expect(screen.getByText('미매핑 Slack 신청 (1)')).toBeTruthy()
      expect(screen.getByText('외부인')).toBeTruthy()
      expect(screen.getByText('대기')).toBeTruthy()
      expect(screen.getByText(/Slack 프로필 이메일이 챔피언 계정 이메일과 달라요/)).toBeTruthy()
    })

    it('미매핑이 없거나 기능이 꺼져 있으면 섹션을 숨긴다', () => {
      const { unmount } = renderClient({ slack: { enabled: true, error: false, unmapped: [] } })
      expect(screen.queryByText(/미매핑 Slack 신청/)).toBeNull()
      unmount()
      renderClient({ slack: { enabled: false, error: false, unmapped } })
      expect(screen.queryByText(/미매핑 Slack 신청/)).toBeNull()
    })
  })
})
