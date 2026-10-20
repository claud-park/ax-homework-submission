import { vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn().mockResolvedValue({ logs: [] }) }))

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MilestoneRow } from '@/components/milestones/MilestoneRow'
import type { Milestone } from '@/lib/types'

const base: Milestone = {
  id: 'm1', user_id: 'u1', season_id: 's1', charter_submission_id: null, week_number: null,
  title: '로그인 개편', description: null, start_date: '2026-10-10', due_date: '2026-10-17',
  status: 'not_started', is_manual_progress: false, is_manual_completed: false,
  bottleneck_type: null, bottleneck_note: null, bottleneck_admin_comment: null,
  bottleneck_reviewed_at: null, note: null, parent_milestone_id: null, display_order: 0,
  source: 'manual', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  publish_status: 'published',
} as Milestone

const handlers = {
  onStart: vi.fn(), onComplete: vi.fn(), onIssueClick: vi.fn(),
  onDeadlineExtension: vi.fn(), onNoteUpdate: vi.fn().mockResolvedValue(undefined),
}

describe('MilestoneRow', () => {
  it('delayed not-started row: 시작 enabled, D+ badge, 이슈 보고 button', () => {
    render(<MilestoneRow m={{ ...base, status: 'delayed' }} todayStr="2026-10-20" charterApproved {...handlers} />)
    expect(screen.getByRole('button', { name: /시작/ })).toBeEnabled()
    expect(screen.getByText('D+3 지연')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이슈 보고' })).toBeInTheDocument()
  })

  it('pending issue shows 이슈 검토중 instead of the button', () => {
    render(
      <MilestoneRow
        m={{ ...base, status: 'delayed', bottleneck_type: 'technical', bottleneck_reviewed_at: null }}
        todayStr="2026-10-20" charterApproved {...handlers}
      />,
    )
    expect(screen.getByText('이슈 검토중')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이슈 보고' })).not.toBeInTheDocument()
  })

  it('detail panel is hidden until expanded; note shown after expand', () => {
    render(<MilestoneRow m={{ ...base, note: '보안팀 승인 대기' }} todayStr="2026-10-20" charterApproved {...handlers} />)
    expect(screen.queryByText('보안팀 승인 대기')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
    expect(screen.getByText('보안팀 승인 대기')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상세 접기' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('unapproved charter disables the stepper', () => {
    render(<MilestoneRow m={base} todayStr="2026-10-20" charterApproved={false} {...handlers} />)
    expect(screen.getByTitle('과제정의서 승인 후 진행할 수 있습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /시작/ })).toBeDisabled()
  })
})
