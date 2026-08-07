import { vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }))

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { apiFetch } from '@/lib/api-client'
import MilestoneActivityLogToggle from '@/components/milestones/MilestoneActivityLogToggle'

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>

describe('MilestoneActivityLogToggle', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it('does not fetch logs until expanded', () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('fetches and renders log entries on first expand', async () => {
    mockApiFetch.mockResolvedValue({
      logs: [
        { id: 'l1', milestone_id: 'm1', user_id: 'u1', log_date: '2026-08-07', note: 'ModuSign 연동 에러 핸들링 보완', created_at: '2026-08-07T10:00:00Z' },
      ],
    })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(screen.getByText('ModuSign 연동 에러 핸들링 보완')).toBeInTheDocument())
    expect(mockApiFetch).toHaveBeenCalledWith('/api/milestones/m1/log')
  })

  it('passes user_id as a query param when provided (admin viewing a champion)', async () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" userId="champion-42" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/milestones/m1/log?user_id=champion-42'))
  })

  it('does not re-fetch on subsequent expands after the first successful load', async () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    const button = screen.getByText(/작업 로그/)
    fireEvent.click(button)
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1))
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
  })

  it('shows an empty-state message when there are no log entries', async () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(screen.getByText('기록된 작업 로그가 없습니다.')).toBeInTheDocument())
  })
})
