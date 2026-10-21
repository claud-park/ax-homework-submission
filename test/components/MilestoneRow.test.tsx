import { vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn().mockResolvedValue({ logs: [] }) }))

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: /시작/ })).toHaveAttribute('aria-disabled', 'true')
  })

  describe('deadline link in detail panel', () => {
    const open = () => fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))

    it('no due_date: 기한 설정 -> (m, false)', () => {
      const m = { ...base, start_date: null, due_date: null }
      render(<MilestoneRow m={m} todayStr="2026-10-20" charterApproved {...handlers} />)
      open()
      handlers.onDeadlineExtension.mockClear()
      const links = screen.getAllByRole('button', { name: '기한 설정' })
      fireEvent.click(links[links.length - 1])
      expect(handlers.onDeadlineExtension).toHaveBeenCalledWith(m, false)
    })

    it('start passed and not_started: 기한 변경 -> (m, true)', () => {
      const m = { ...base, due_date: '2026-10-30' }
      render(<MilestoneRow m={m} todayStr="2026-10-20" charterApproved {...handlers} />)
      open()
      handlers.onDeadlineExtension.mockClear()
      fireEvent.click(screen.getByRole('button', { name: '기한 변경' }))
      expect(handlers.onDeadlineExtension).toHaveBeenCalledWith(m, true)
    })

    it('otherwise: 기한 연장 -> (m, false)', () => {
      const m = { ...base, status: 'in_progress' as const, due_date: '2026-10-30' }
      render(<MilestoneRow m={m} todayStr="2026-10-20" charterApproved {...handlers} />)
      open()
      handlers.onDeadlineExtension.mockClear()
      fireEvent.click(screen.getByRole('button', { name: '기한 연장' }))
      expect(handlers.onDeadlineExtension).toHaveBeenCalledWith(m, false)
    })

    it('completed: no deadline link', () => {
      render(<MilestoneRow m={{ ...base, status: 'completed' }} todayStr="2026-10-20" charterApproved {...handlers} />)
      open()
      expect(screen.queryByRole('button', { name: /기한/ })).not.toBeInTheDocument()
    })
  })

  it('keeps the note editor open with the draft when saving fails', async () => {
    const onNoteUpdate = vi.fn().mockRejectedValue(new Error('fail'))
    render(
      <MilestoneRow
        m={{ ...base, status: 'in_progress', due_date: '2026-10-30' }}
        todayStr="2026-10-20" charterApproved {...handlers} onNoteUpdate={onNoteUpdate}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
    fireEvent.click(screen.getByRole('button', { name: '노트 편집' }))
    fireEvent.change(screen.getByPlaceholderText('진행 상황을 간단히 메모해주세요'), { target: { value: '초안 메모' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(onNoteUpdate).toHaveBeenCalledWith('m1', '초안 메모'))
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled())
    expect(screen.getByDisplayValue('초안 메모')).toBeInTheDocument()
  })

  it('keeps the note draft when collapsed and re-expanded', () => {
    render(<MilestoneRow m={{ ...base, status: 'in_progress', is_manual_progress: true, due_date: '2026-10-30' }} todayStr="2026-10-20" charterApproved {...handlers} />)
    fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
    fireEvent.click(screen.getByRole('button', { name: '노트 편집' }))
    fireEvent.change(screen.getByPlaceholderText('진행 상황을 간단히 메모해주세요'), { target: { value: '초안 작성 중' } })
    fireEvent.click(screen.getByRole('button', { name: '상세 접기' }))
    expect(screen.getByText('노트 편집중')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
    expect(screen.getByPlaceholderText('진행 상황을 간단히 메모해주세요')).toHaveValue('초안 작성 중')
    expect(screen.queryByText('노트 편집중')).not.toBeInTheDocument()
  })
})

it('hides the editor and the 노트 편집중 chip once the stage leaves in_progress', () => {
  const m = { ...base, status: 'in_progress', is_manual_progress: true, due_date: '2026-10-30' } as Milestone
  const { rerender } = render(<MilestoneRow m={m} todayStr="2026-10-20" charterApproved {...handlers} />)
  fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
  fireEvent.click(screen.getByRole('button', { name: '노트 편집' }))
  fireEvent.change(screen.getByPlaceholderText('진행 상황을 간단히 메모해주세요'), { target: { value: '초안' } })
  fireEvent.click(screen.getByRole('button', { name: '상세 접기' }))
  rerender(<MilestoneRow m={{ ...m, is_manual_completed: true }} todayStr="2026-10-20" charterApproved {...handlers} />)
  expect(screen.queryByText('노트 편집중')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
  expect(screen.queryByPlaceholderText('진행 상황을 간단히 메모해주세요')).not.toBeInTheDocument()
  // 다시 진행중이 되면 초안이 살아난다
  rerender(<MilestoneRow m={m} todayStr="2026-10-20" charterApproved {...handlers} />)
  expect(screen.getByPlaceholderText('진행 상황을 간단히 메모해주세요')).toHaveValue('초안')
})
