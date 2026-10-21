import { vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn().mockResolvedValue({ logs: [] }) }))

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MobileMilestoneCard } from '@/components/MobileMilestoneCard'
import type { Milestone } from '@/lib/types'

const base: Milestone = {
  id: 'm1', user_id: 'u1', season_id: 's1', charter_submission_id: null, week_number: null,
  title: '로그인 개편', description: null, start_date: '2026-10-10', due_date: '2026-10-25',
  status: 'in_progress', is_manual_progress: true, is_manual_completed: false,
  bottleneck_type: null, bottleneck_note: null, bottleneck_admin_comment: null,
  bottleneck_reviewed_at: null, note: null, parent_milestone_id: null, display_order: 0,
  source: 'manual', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  publish_status: 'published',
} as Milestone

const handlers = {
  onStart: vi.fn(), onComplete: vi.fn(), onIssueClick: vi.fn(),
  onDeadlineExtension: vi.fn(), onNoteUpdate: vi.fn().mockResolvedValue(undefined),
}

beforeEach(() => vi.clearAllMocks())

describe('MobileMilestoneCard', () => {
  it('in_progress card completes via the stepper', () => {
    render(<MobileMilestoneCard m={base} todayStr="2026-10-20" charterApproved {...handlers} />)
    fireEvent.click(screen.getByRole('button', { name: '완료로' }))
    expect(handlers.onComplete).toHaveBeenCalledWith('m1')
  })

  it('delayed unreported card reports the issue with the milestone object', () => {
    const m = { ...base, status: 'delayed', due_date: '2026-10-17' } as Milestone
    render(<MobileMilestoneCard m={m} todayStr="2026-10-20" charterApproved {...handlers} />)
    fireEvent.click(screen.getByRole('button', { name: '이슈 보고' }))
    expect(handlers.onIssueClick).toHaveBeenCalledWith(m)
  })

  it('hides the note until the panel is expanded', async () => {
    render(<MobileMilestoneCard m={{ ...base, note: '진행 메모' }} todayStr="2026-10-20" charterApproved {...handlers} />)
    expect(screen.queryByText('진행 메모')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
    expect(screen.getByText('진행 메모')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '상세 접기' })).toBeInTheDocument())
  })

  it('expand button is a 44px touch target', () => {
    render(<MobileMilestoneCard m={base} todayStr="2026-10-20" charterApproved {...handlers} />)
    const btn = screen.getByRole('button', { name: '상세 펼치기' })
    expect(btn).toHaveStyle({ width: '44px', height: '44px' })
  })
})
